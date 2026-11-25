import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource } from 'typeorm';

import { GHN_RETURN_STATUSES } from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities/cod-reconciliation.entity';
import {
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities/order.entity';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { CoinService } from './coin.service';
import { CoinCodReleaseAudit, CoinOrderDebit } from './entities';
import type { CoinReleaseCause } from './schemas/coin.schema';

@Injectable()
export class CoinCodReleaseService {
  constructor(
    private readonly db: DataSource,
    private readonly coins: CoinService,
  ) {}
  async release(
    actorId: string,
    orderId: string,
    input: { requestId: string; cause: CoinReleaseCause; evidence: string },
  ) {
    return this.db.transaction(async (manager) => {
      if (
        !(await manager.existsBy(User, {
          id: actorId,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        }))
      )
        throw new ForbiddenException('Active Admin required');
      const prior = await manager.findOneBy(CoinCodReleaseAudit, {
        orderId,
        requestId: input.requestId,
      });
      if (prior) {
        if (prior.cause !== input.cause || prior.evidence !== input.evidence)
          throw new ConflictException('Release request changed');
        return prior;
      }
      const order = await manager.findOneByOrFail(Order, { id: orderId });
      const shipment = await manager.findOneBy(Shipment, { orderId });
      const collected =
        (await manager.existsBy(CodCollection, { orderId })) ||
        (await manager.existsBy(CoinOrderDebit, { orderId })) ||
        shipment?.codCollectedAt ||
        shipment?.carrierTransferredAt;
      if (order.paymentMethod !== ORDER_PAYMENT_METHOD.COD || collected)
        throw new ConflictException('Collected COD coins cannot be released');
      const safelyEnded =
        order.status === ORDER_STATUS.CANCELLED &&
        (!shipment ||
          (shipment.state === 'CANCELLED' && !shipment.pickedObservedAt));
      const returning =
        order.status === ORDER_STATUS.RETURNS &&
        shipment &&
        (GHN_RETURN_STATUSES as readonly string[]).includes(
          shipment.providerStatus ?? '',
        );
      if (!safelyEnded && !returning)
        throw new ConflictException(
          'Verified cancellation or carrier return required',
        );
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      await this.coins.releaseOrderCoins(
        manager,
        order,
        input.cause,
        new Date(now),
      );
      return manager.save(
        CoinCodReleaseAudit,
        manager.create(CoinCodReleaseAudit, {
          orderId,
          requestId: input.requestId,
          actorId,
          cause: input.cause,
          evidence: input.evidence,
          verifiedAt: new Date(now),
        }),
      );
    });
  }
}
