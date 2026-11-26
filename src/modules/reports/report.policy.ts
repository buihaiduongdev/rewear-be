import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { type EntityManager, In } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { Order } from '@/modules/order/entities';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { suspendProductForModeration } from '@/modules/product/policies/suspend-product.policy';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import {
  REPORT_MEASURE,
  REPORT_POLICY,
  REPORT_TARGET,
} from './constants/report.constant';
import { ReportEvidence, type ViolationReport } from './entities';
import type {
  CreateReportInput,
  ReportTargetSnapshot,
  ReportTargetType,
  ResolveReportInput,
} from './schemas/report.schema';

export async function reportTargetSnapshot(
  manager: EntityManager,
  userId: string,
  type: ReportTargetType,
  id: string,
): Promise<ReportTargetSnapshot> {
  if (type === REPORT_TARGET.SHOP) {
    const shop = await manager.findOneBy(Shop, {
      id,
      status: ShopStatus.ACTIVE,
    });
    if (shop)
      return { type, id, shopId: id, label: shop.name, contextOrderId: null };
    const order = await manager.findOne(Order, {
      where: { buyerId: userId, shopId: id },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    if (order)
      return {
        type,
        id,
        shopId: id,
        label: order.shopName,
        contextOrderId: order.id,
      };
  } else {
    const product = await manager.findOneBy(Product, {
      id,
      status: ProductStatus.ACTIVE,
    });
    const isPublic =
      product?.categoryId &&
      (await manager.existsBy(Category, {
        id: product.categoryId,
        isActive: true,
      })) &&
      (await manager.existsBy(Shop, {
        id: product.shopId,
        status: ShopStatus.ACTIVE,
      })) &&
      (await manager.existsBy(ProductModeration, {
        productId: id,
        status: ProductModerationStatus.APPROVED,
      }));
    if (product && isPublic)
      return {
        type,
        id,
        shopId: product.shopId,
        label: product.title ?? '',
        contextOrderId: null,
      };
    const order = await manager
      .createQueryBuilder(Order, 'order')
      .where('order.buyerId = :userId', { userId })
      .andWhere('order.items @> CAST(:items AS jsonb)', {
        items: JSON.stringify([{ productId: id }]),
      })
      .orderBy('order.createdAt', 'DESC')
      .addOrderBy('order.id', 'DESC')
      .getOne();
    const item = order?.items.find((item) => item.productId === id);
    if (order && item)
      return {
        type,
        id,
        shopId: order.shopId,
        label: item.title,
        contextOrderId: order.id,
      };
  }
  throw new NotFoundException('Report target not available');
}

export async function reportSubmissionTarget(
  manager: EntityManager,
  userId: string,
  input: CreateReportInput,
) {
  if (!input.evidenceIds.length)
    return reportTargetSnapshot(
      manager,
      userId,
      input.targetType,
      input.targetId,
    );
  const evidence = await manager.findBy(ReportEvidence, {
    id: In(input.evidenceIds),
  });
  const valid =
    evidence.length === input.evidenceIds.length &&
    evidence.every(
      (item) =>
        item.uploadedById === userId &&
        item.targetType === input.targetType &&
        item.targetId === input.targetId &&
        item.reportId === null,
    );
  if (!valid)
    throw new BadRequestException(
      'Report evidence must belong to the reporter and match the target',
    );
  return evidence[0].target;
}

export async function attachReportEvidence(
  manager: EntityManager,
  row: ViolationReport,
  ids: string[],
) {
  const evidence = ids.length
    ? await manager.findBy(ReportEvidence, { id: In(ids) })
    : [];
  const invalidEvidence =
    evidence.length !== ids.length ||
    evidence.some(
      (item) =>
        item.uploadedById !== row.reporterId ||
        item.targetType !== row.targetType ||
        item.targetId !== row.targetId ||
        (item.reportId !== null && item.reportId !== row.id),
    );
  if (invalidEvidence)
    throw new BadRequestException(
      'Report evidence must belong to the reporter and match the target',
    );
  const newEvidence = evidence.filter((item) => item.reportId === null);
  const count = await manager.countBy(ReportEvidence, { reportId: row.id });
  if (count + newEvidence.length > REPORT_POLICY.MAX_EVIDENCE)
    throw new BadRequestException('Report evidence limit reached');
  for (const item of newEvidence) {
    item.reportId = row.id;
    await manager.save(item);
  }
}

export async function applyReportMeasure(
  manager: EntityManager,
  row: ViolationReport,
  input: ResolveReportInput,
): Promise<Record<string, unknown>> {
  if (input.action === REPORT_MEASURE.NONE) return { changed: false };
  if (input.action === REPORT_MEASURE.SUSPEND_PRODUCT) {
    if (row.targetType !== REPORT_TARGET.PRODUCT)
      throw new BadRequestException(
        'Product suspension requires a Product report',
      );
    const effect = await suspendProductForModeration(
      manager,
      row.targetId,
      input.reason,
      {
        expectedVersion: input.expectedTargetVersion,
        expectedShopId: row.target.shopId,
        allowAlreadySuspended: true,
      },
    );
    if (effect.changed)
      await new OutboxService().record(manager, {
        eventType: EVENT_TYPES.PRODUCT_REVIEW_DECIDED,
        resourceId: effect.product.id,
        payload: {
          productId: effect.product.id,
          shopId: effect.product.shopId,
          moderationId: effect.moderation.id,
          version: effect.moderation.version,
          status: effect.moderation.status,
        },
      });
    return {
      targetId: row.targetId,
      before: effect.before,
      after: effect.product.status,
      changed: effect.changed,
    };
  }
  if (row.targetType !== REPORT_TARGET.SHOP)
    throw new BadRequestException('Shop deactivation requires a Shop report');
  const shop = await manager.findOne(Shop, {
    where: { id: row.targetId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!shop) throw new ConflictException('Shop target no longer exists');
  const before = shop.status;
  shop.status = ShopStatus.INACTIVE;
  const changed = before !== shop.status;
  if (changed) {
    await manager.save(shop);
    await new OutboxService().record(manager, {
      eventType: EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT,
      resourceId: shop.id,
      payload: {
        reportId: row.id,
        shopId: shop.id,
        version: row.version,
      },
    });
  }
  return { targetId: shop.id, before, after: shop.status, changed };
}
