import { Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import {
  NOTIFICATION_KIND,
  NOTIFICATION_TARGET,
} from '@/modules/notifications/constants/notification.constant';
import { publishNotification } from '@/modules/notifications/publish-notification';
import { personalRecipient } from '@/modules/notifications/sources/notification-recipients';

import { Shop } from '../../entities';
import {
  IDENTITY_RENEWAL_POLICY,
  SHOP_APPLICATION_KIND,
  SHOP_APPLICATION_STATE,
} from '../constants/shop-application.constant';
import { ShopApplication } from '../entities';
import { shopAllowsIdentitySales } from './identity-sale.policy';

@Injectable()
export class IdentityRenewalWorker {
  constructor(private readonly db: DataSource) {}

  async run(now = new Date()) {
    await this.db.transaction(async (manager) => {
      const today = new Date(
        now.getTime() + IDENTITY_RENEWAL_POLICY.VIETNAM_OFFSET_MS,
      )
        .toISOString()
        .slice(0, 10);
      const shops = await manager
        .getRepository(Shop)
        .createQueryBuilder('shop')
        .where('shop."onboardingRequired" = true')
        .andWhere('shop."approvedAt" IS NOT NULL')
        .andWhere('shop."identityExpiresOn" IS NOT NULL')
        .andWhere('shop."identityExpiresOn" < :today', { today })
        .orderBy('shop."identityExpiresOn"', 'ASC')
        .addOrderBy('shop.id', 'ASC')
        .take(IDENTITY_RENEWAL_POLICY.BATCH_SIZE)
        .getMany();

      for (const shop of shops) {
        if (!shop.identityExpiresOn) continue;
        const app = await manager.findOneBy(ShopApplication, {
          shopId: shop.id,
          kind: SHOP_APPLICATION_KIND.INITIAL,
          state: SHOP_APPLICATION_STATE.APPROVED,
        });
        if (!app) continue;
        const paused = !shopAllowsIdentitySales(shop, now);
        const stage = paused ? 'paused' : 'grace';
        await publishNotification(manager, {
          key: `identity-renewal:${shop.id}:${shop.identityExpiresOn}:${stage}`,
          kind: NOTIFICATION_KIND.SHOP_APPLICATION,
          targetType: NOTIFICATION_TARGET.SHOP_APPLICATION,
          sourceId: app.id,
          title: paused
            ? 'Shop tạm dừng giao dịch mới'
            : 'Giấy tờ định danh sắp hết thời gian ân hạn',
          body: 'Mở hồ sơ Shop sau đăng nhập để cập nhật giấy tờ định danh. Đơn hàng cũ vẫn được xử lý bình thường.',
          mode: null,
          email: true,
          recipients: [personalRecipient(app.applicantId)],
        });
      }
    });
  }
}
