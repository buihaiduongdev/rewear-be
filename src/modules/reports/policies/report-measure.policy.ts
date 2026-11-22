import { BadRequestException, ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import {
  NOTIFICATION_KIND,
  NOTIFICATION_TARGET,
} from '@/modules/notifications/constants/notification.constant';
import { publishNotification } from '@/modules/notifications/publish-notification';
import { shopRecipients } from '@/modules/notifications/sources/notification-recipients';
import { notifyProductReview } from '@/modules/notifications/sources/product-review.notification';
import { suspendProductForModeration } from '@/modules/product/policies/suspend-product.policy';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { REPORT_MEASURE, REPORT_TARGET } from '../constants/report.constant';
import type { ViolationReport } from '../entities/report.entity';
import type { ResolveReportInput } from '../types/report.type';

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
      await notifyProductReview(manager, effect.product, effect.moderation);
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
  if (changed) await manager.save(shop);
  if (changed)
    await publishNotification(manager, {
      key: `report-shop-action:${row.id}:${row.version}`,
      kind: NOTIFICATION_KIND.VIOLATION_REPORT,
      targetType: NOTIFICATION_TARGET.SHOP,
      sourceId: shop.id,
      title: 'Cập nhật kiểm duyệt Shop',
      body: 'Shop đã được Admin ngừng nhận giao dịch mới sau khi xác minh vi phạm. Liên hệ hỗ trợ để làm rõ quyết định.',
      mode: null,
      recipients: await shopRecipients(
        manager,
        shop.id,
        SHOP_PERMISSIONS.SHOP_OWNER,
      ),
    });
  return { targetId: shop.id, before, after: shop.status, changed };
}
