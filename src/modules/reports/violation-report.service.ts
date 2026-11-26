import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, type EntityManager } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { Category } from '@/modules/category/entities';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { MediaService } from '@/modules/media/media.service';
import { Order } from '@/modules/order/entities';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { suspendProductForModeration } from '@/modules/product/policies/suspend-product.policy';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import {
  REPORT_ACTION,
  REPORT_MEASURE,
  REPORT_MIME_TYPES,
  REPORT_POLICY,
  REPORT_STATUS,
  REPORT_TARGET,
} from './constants/report.constant';
import { ReportEvidence, ViolationReport } from './entities';
import {
  type CreateReportInput,
  createReportSchema,
  type ReportAction,
  type ReportQuery,
  type ReportSupplementInput,
  reportSupplementSchema,
  type ReportTargetSnapshot,
  type ReportTargetType,
  type ResolveReportInput,
  resolveReportSchema,
} from './schemas/report.schema';

@Injectable()
export class ViolationReportService {
  constructor(
    private readonly db: DataSource,
    private readonly outboxService: OutboxService,
    private readonly storage: StorageService,
    private readonly mediaService: MediaService,
  ) {}

  private async assertActiveUser(manager: EntityManager, userId: string) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active account required');
    return user;
  }

  private async assertAdmin(manager: EntityManager, userId: string) {
    const user = await this.assertActiveUser(manager, userId);
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Active Admin required');
    return user;
  }

  private async loadOwn(
    manager: EntityManager,
    userId: string,
    id: string,
    lock = false,
  ) {
    await this.assertActiveUser(manager, userId);
    const row = await manager.findOne(ViolationReport, {
      where: { id, reporterId: userId },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }

  private async loadAdminReport(
    manager: EntityManager,
    userId: string,
    id: string,
    lock = false,
  ) {
    await this.assertAdmin(manager, userId);
    const row = await manager.findOne(ViolationReport, {
      where: { id },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }

  private async recordOutboxAction(
    manager: EntityManager,
    row: ViolationReport,
    action: ReportAction,
  ) {
    await this.outboxService.record(manager, {
      eventType: EVENT_TYPES.VIOLATION_REPORT_UPDATED,
      resourceId: row.id,
      payload: {
        reportId: row.id,
        reporterId: row.reporterId,
        version: 1,
        action,
      },
    });
  }

  create(userId: string, input: CreateReportInput) {
    const data = createReportSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await this.assertActiveUser(manager, userId);
      const target = await this.reportTargetSnapshot(
        manager,
        userId,
        data.targetType,
        data.targetId,
      );
      const row = await manager.save(
        ViolationReport,
        manager.create(ViolationReport, {
          reporterId: userId,
          targetType: data.targetType,
          targetId: data.targetId,
          target,
          reason: data.reason,
          description: data.description,
          status: REPORT_STATUS.OPEN,
          assignedAdminId: null,
          outcome: null,
          measure: null,
          resolutionReason: null,
          adminNote: null,
          resolvedAt: null,
        }),
      );
      await this.attachMedia(manager, row, data.mediaIds);
      await this.recordOutboxAction(manager, row, REPORT_ACTION.SUBMITTED);
      return this.view(manager, row);
    });
  }

  supplement(userId: string, id: string, input: ReportSupplementInput) {
    const data = reportSupplementSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const row = await this.loadOwn(manager, userId, id, true);
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException(
          'Closed reports cannot receive supplements',
        );
      await this.attachMedia(manager, row, data.mediaIds);
      row.description = `${row.description}\n\n${data.text}`;
      await manager.save(row);
      await this.recordOutboxAction(manager, row, REPORT_ACTION.SUPPLEMENTED);
      return this.view(manager, row);
    });
  }

  claim(actorId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const row = await this.loadAdminReport(manager, actorId, id, true);
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException('Report already resolved');
      if (
        row.status !== REPORT_STATUS.IN_REVIEW ||
        row.assignedAdminId !== actorId
      ) {
        row.status = REPORT_STATUS.IN_REVIEW;
        row.assignedAdminId = actorId;
        await manager.save(row);
        await this.recordOutboxAction(manager, row, REPORT_ACTION.CLAIMED);
      }
      return this.view(manager, row, true);
    });
  }

  resolve(actorId: string, id: string, input: ResolveReportInput) {
    const data = resolveReportSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const row = await this.loadAdminReport(manager, actorId, id, true);
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException('Report already resolved');
      await this.applyReportMeasure(manager, row, data);
      row.status = REPORT_STATUS.RESOLVED;
      row.outcome = data.outcome;
      row.measure = data.action;
      row.resolutionReason = data.reason;
      row.adminNote = data.adminNote;
      row.resolvedAt = new Date();
      await manager.save(row);
      await this.recordOutboxAction(manager, row, REPORT_ACTION.RESOLVED);
      return this.view(manager, row, true);
    });
  }

  async mineDetail(userId: string, id: string) {
    const row = await this.loadOwn(this.db.manager, userId, id);
    return this.view(this.db.manager, row);
  }

  async adminDetail(userId: string, id: string) {
    const row = await this.loadAdminReport(this.db.manager, userId, id);
    return this.view(this.db.manager, row, true);
  }

  async downloadEvidence(userId: string, id: string) {
    const actor = await this.assertActiveUser(this.db.manager, userId);
    const row = await this.db.manager.findOneBy(ReportEvidence, { id });
    if (!row || row.media.retiredAt)
      throw new NotFoundException('Attached report evidence not found');
    if (actor.role === UserRole.ADMIN)
      await this.loadAdminReport(this.db.manager, userId, row.reportId);
    else await this.loadOwn(this.db.manager, userId, row.reportId);
    return this.storage.createDownloadUrl(row.media.storageKey);
  }

  async list(userId: string, input: ReportQuery, admin = false) {
    const manager = this.db.manager;
    if (admin) await this.assertAdmin(manager, userId);
    else await this.assertActiveUser(manager, userId);
    const query = manager.createQueryBuilder(ViolationReport, 'report');
    if (!admin) query.where('report.reporterId = :userId', { userId });
    if (input.status)
      query.andWhere('report.status = :status', { status: input.status });
    if (input.targetType)
      query.andWhere('report.targetType = :type', { type: input.targetType });
    const [rows, totalCount] = await query
      .orderBy('report.createdAt', 'DESC')
      .addOrderBy('report.id', 'DESC')
      .take(input.limit)
      .skip(input.offset)
      .getManyAndCount();
    const items = rows.map((row) =>
      admin
        ? {
            ...this.summary(row),
            reporterId: row.reporterId,
            assignedAdminId: row.assignedAdminId,
          }
        : this.summary(row),
    );
    return { items, totalCount, limit: input.limit, offset: input.offset };
  }

  private summary(row: ViolationReport) {
    return {
      id: row.id,
      targetType: row.targetType,
      target: row.target,
      reason: row.reason,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      resolution:
        row.outcome && row.measure && row.resolutionReason && row.resolvedAt
          ? {
              outcome: row.outcome,
              action: row.measure,
              reason: row.resolutionReason,
              resolvedAt: row.resolvedAt,
            }
          : null,
    };
  }

  private async view(
    manager: EntityManager,
    row: ViolationReport,
    admin = false,
  ) {
    const evidence = await manager.find(ReportEvidence, {
      where: { reportId: row.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const result = {
      ...this.summary(row),
      evidence: evidence.map((item) => ({
        id: item.id,
        mimeType: item.media.mimeType,
        sizeBytes: item.media.sizeBytes,
      })),
    };
    if (!admin) return result;
    const target =
      row.targetType === REPORT_TARGET.PRODUCT
        ? await manager.findOneBy(Product, { id: row.targetId })
        : await manager.findOneBy(Shop, { id: row.targetId });
    const moderation =
      row.targetType === REPORT_TARGET.PRODUCT
        ? await manager.findOneBy(ProductModeration, {
            productId: row.targetId,
          })
        : null;
    return {
      ...result,
      reporterId: row.reporterId,
      assignedAdminId: row.assignedAdminId,
      adminNote: row.adminNote,
      targetState: {
        exists: !!target,
        status: target?.status ?? null,
        moderationVersion: moderation?.version ?? null,
      },
    };
  }

  private async reportTargetSnapshot(
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

  private async attachMedia(
    manager: EntityManager,
    row: ViolationReport,
    mediaIds: string[],
  ) {
    if (!mediaIds.length) return;
    const count = await manager.countBy(ReportEvidence, { reportId: row.id });
    if (count + mediaIds.length > REPORT_POLICY.MAX_EVIDENCE)
      throw new BadRequestException('Report evidence limit reached');
    for (const mediaId of mediaIds) {
      const file = await this.mediaService.verifyMedia(
        manager,
        row.reporterId,
        mediaId,
        REPORT_POLICY.IMAGE_BYTES,
        'private',
      );
      if (!REPORT_MIME_TYPES.some((mimeType) => mimeType === file.mimeType))
        throw new BadRequestException('Unsupported report evidence type');
      await manager.save(
        ReportEvidence,
        manager.create(ReportEvidence, {
          reportId: row.id,
          mediaId: file.id,
        }),
      );
    }
  }

  private async applyReportMeasure(
    manager: EntityManager,
    row: ViolationReport,
    input: ResolveReportInput,
  ) {
    if (input.action === REPORT_MEASURE.NONE) return;
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
        await this.outboxService.record(manager, {
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
      return;
    }
    if (row.targetType !== REPORT_TARGET.SHOP)
      throw new BadRequestException('Shop deactivation requires a Shop report');
    const shop = await manager.findOne(Shop, {
      where: { id: row.targetId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!shop) throw new ConflictException('Shop target no longer exists');
    if (shop.status !== ShopStatus.INACTIVE) {
      shop.status = ShopStatus.INACTIVE;
      await manager.save(shop);
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT,
        resourceId: shop.id,
        payload: {
          reportId: row.id,
          shopId: shop.id,
          version: 1,
        },
      });
    }
  }
}
