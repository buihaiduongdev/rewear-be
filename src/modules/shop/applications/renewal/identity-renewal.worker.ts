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

const { VIETNAM_OFFSET_MS, DAY_MS, GRACE_DAYS, BATCH_SIZE } =
  IDENTITY_RENEWAL_POLICY;

@Injectable()
export class IdentityRenewalWorker {
  constructor(private readonly db: DataSource) {}

  async run(now = new Date()) {
    await this.db.transaction(async (manager) => {
      const today = new Date(now.getTime() + VIETNAM_OFFSET_MS)
        .toISOString()
        .slice(0, 10);
      const pausedCutoff = new Date(
        now.getTime() + VIETNAM_OFFSET_MS - (GRACE_DAYS + 1) * DAY_MS,
      )
        .toISOString()
        .slice(0, 10);

      const rows = await manager
        .getRepository(Shop)
        .createQueryBuilder('shop')
        .innerJoin(
          ShopApplication,
          'app',
          'app."shopId" = shop.id AND app.kind = :kind AND app.state = :state',
          {
            kind: SHOP_APPLICATION_KIND.INITIAL,
            state: SHOP_APPLICATION_STATE.APPROVED,
          },
        )
        .select([
          'shop.id AS "shopId"',
          'to_char(shop."identityExpiresOn", \'YYYY-MM-DD\') AS "identityExpiresOn"',
          'shop."identityManualRestriction" AS "identityManualRestriction"',
          'app.id AS "applicationId"',
          'app."applicantId" AS "applicantId"',
        ])
        .where('shop."onboardingRequired" = true')
        .andWhere('shop."approvedAt" IS NOT NULL')
        .andWhere('shop."identityExpiresOn" IS NOT NULL')
        .andWhere('shop."identityExpiresOn" < :today', { today })
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM notification_events ne
            WHERE ne.key = (
              'identity-renewal:' || shop.id::text || ':' ||
              to_char(shop."identityExpiresOn", 'YYYY-MM-DD') || ':' ||
              CASE
                WHEN shop."identityManualRestriction" = true
                  OR shop."identityExpiresOn" <= :pausedCutoff
                THEN 'paused'
                ELSE 'grace'
              END
            )
          )`,
          { pausedCutoff },
        )
        .orderBy('shop."identityExpiresOn"', 'ASC')
        .addOrderBy('shop.id', 'ASC')
        .limit(BATCH_SIZE)
        .getRawMany<{
          shopId: string;
          identityExpiresOn: string;
          identityManualRestriction: boolean;
          applicationId: string;
          applicantId: string;
        }>();

      for (const row of rows) {
        const paused = !shopAllowsIdentitySales(row, now);
        const stage = paused ? 'paused' : 'grace';
        await publishNotification(manager, {
          key: `identity-renewal:${row.shopId}:${row.identityExpiresOn}:${stage}`,
          kind: NOTIFICATION_KIND.SHOP_APPLICATION,
          targetType: NOTIFICATION_TARGET.SHOP_APPLICATION,
          sourceId: row.applicationId,
          title: paused
            ? 'Shop tạm dừng giao dịch mới'
            : 'Giấy tờ định danh sắp hết thời gian ân hạn',
          body: 'Mở hồ sơ Shop sau đăng nhập để cập nhật giấy tờ định danh. Đơn hàng cũ vẫn được xử lý bình thường.',
          mode: null,
          email: true,
          recipients: [personalRecipient(row.applicantId)],
        });
      }
    });
  }
}
