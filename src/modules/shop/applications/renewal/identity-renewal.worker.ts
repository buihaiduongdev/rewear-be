import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DataSource } from 'typeorm';

import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';

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
  private readonly logger = new Logger(IdentityRenewalWorker.name);
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly outboxService: OutboxService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(now?: Date) {
    if (this.running) return;
    this.running = true;
    const current = now instanceof Date ? now : new Date();
    try {
      await this.scan(current);
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Identity renewal scan failed; retry required',
      );
      if (now instanceof Date) throw error;
    } finally {
      this.running = false;
    }
  }

  private async scan(now: Date) {
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
            SELECT 1 FROM outbox_events oe
            WHERE oe.event_type = :eventType
              AND oe.payload->>'dedupKey' = (
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
          { eventType: EVENT_TYPES.SHOP_IDENTITY_RENEWAL, pausedCutoff },
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
        await this.outboxService.record(manager, {
          eventType: EVENT_TYPES.SHOP_IDENTITY_RENEWAL,
          resourceId: row.applicationId,
          payload: {
            applicationId: row.applicationId,
            shopId: row.shopId,
            applicantId: row.applicantId,
            identityExpiresOn: row.identityExpiresOn,
            stage,
            dedupKey: `identity-renewal:${row.shopId}:${row.identityExpiresOn}:${stage}`,
          },
        });
      }
    });
  }
}
