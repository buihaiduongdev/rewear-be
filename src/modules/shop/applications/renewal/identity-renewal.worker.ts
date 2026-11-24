import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { DataSource, type EntityManager } from 'typeorm';

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
import { ShopApplication } from '../entities/shop-application.entity';
import {
  identityGraceDeadline,
  shopAllowsIdentitySales,
} from './identity-sale.policy';

@Injectable()
export class IdentityRenewalWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(IdentityRenewalWorker.name);
  constructor(private readonly db: DataSource) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.run()
        .catch((e) =>
          this.logger.error(
            'Identity renewal scan failed',
            e instanceof Error ? e.stack : undefined,
          ),
        )
        .finally(() => {
          this.running = false;
        });
    }, IDENTITY_RENEWAL_POLICY.WORKER_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async run() {
    await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const shops = await manager
        .getRepository(Shop)
        .createQueryBuilder('shop')
        .where('shop."onboardingRequired"=true')
        .andWhere('shop."approvedAt" IS NOT NULL')
        .andWhere(
          '(shop."identityNextCheckAt" IS NULL OR shop."identityNextCheckAt" <= :now)',
          { now },
        )
        .orderBy('shop."identityNextCheckAt"', 'ASC', 'NULLS FIRST')
        .addOrderBy('shop.id', 'ASC')
        .take(IDENTITY_RENEWAL_POLICY.BATCH_SIZE)
        .getMany();
      for (const shop of shops) await this.observe(manager, shop, now);
    });
  }
  private async observe(manager: EntityManager, shop: Shop, now: Date) {
    const original = await manager.findOneBy(ShopApplication, {
      shopId: shop.id,
      kind: SHOP_APPLICATION_KIND.INITIAL,
      state: SHOP_APPLICATION_STATE.APPROVED,
    });
    if (!original?.snapshot) {
      shop.identityNextCheckAt = new Date(
        now.getTime() + IDENTITY_RENEWAL_POLICY.RECHECK_MS,
      );
      await manager.save(shop);
      return;
    }
    if (!shop.identityDocumentVersion) {
      shop.identityDocumentVersion = 1;
      shop.identityExpiresOn = original.snapshot.identity.expiresOn;
    }
    const paused = !shopAllowsIdentitySales(shop, now);
    const expired =
      shop.identityExpiresOn &&
      now.getTime() >=
        identityGraceDeadline(shop.identityExpiresOn).getTime() -
          IDENTITY_RENEWAL_POLICY.GRACE_DAYS * IDENTITY_RENEWAL_POLICY.DAY_MS;
    const firstExpiry =
      expired &&
      shop.identityExpiryNotifiedVersion !== shop.identityDocumentVersion;
    const changed = paused !== !!shop.identityObservedRestricted;
    if (firstExpiry || changed) {
      shop.identityNoticeRevision = (shop.identityNoticeRevision ?? 0) + 1;
      await publishNotification(manager, {
        key: `identity-renewal:${shop.id}:${shop.identityNoticeRevision}`,
        kind: NOTIFICATION_KIND.SHOP_APPLICATION,
        targetType: NOTIFICATION_TARGET.SHOP_APPLICATION,
        sourceId: original.id,
        title: paused ? 'Shop tạm dừng giao dịch mới' : 'Cập nhật giấy tờ Shop',
        body: 'Mở hồ sơ Shop sau đăng nhập để xem trạng thái giấy tờ và hướng xử lý. Đơn hàng cũ vẫn được quản lý.',
        mode: null,
        email: true,
        recipients: [personalRecipient(original.applicantId)],
      });
      if (firstExpiry)
        shop.identityExpiryNotifiedVersion = shop.identityDocumentVersion;
    }
    shop.identityObservedRestricted = paused;
    const next = now.getTime() + IDENTITY_RENEWAL_POLICY.RECHECK_MS;
    const boundary = shop.identityExpiresOn
      ? identityGraceDeadline(shop.identityExpiresOn).getTime()
      : next;
    const correction = shop.identityCorrectionUntil?.getTime() ?? boundary;
    const futureBoundary = Math.max(boundary, correction);
    shop.identityNextCheckAt = new Date(
      futureBoundary > now.getTime() ? Math.min(next, futureBoundary) : next,
    );
    await manager.save(shop);
  }
}
