import { Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { OrderAccess } from '@/modules/order/order.access';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { DisputeAccess } from '../dispute.access';
import { DisputeReturn } from './entities/dispute-return.entity';
import {
  CarrierCompensationAcknowledgement,
  CarrierCompensationReceipt,
  DisputeReturnException,
  DisputeSafetyWaiver,
  ReturnShippingCharge,
} from './entities/return-exception.entity';
import { remedyContext, remedyReviewToken } from './return-remedy.access';

@Injectable()
export class ReturnExceptionReadService {
  constructor(private readonly db: DataSource) {}
  read(userId: string, finalId: string, admin = false) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const ctx = await remedyContext(manager, finalId);
      if (admin)
        await manager.findOneByOrFail(User, {
          id: userId,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        });
      else
        await new DisputeAccess(new OrderAccess()).assertParty(
          manager,
          userId,
          ctx.order.id,
        );
      const safety = await manager.findOneBy(DisputeSafetyWaiver, {
        finalDecisionId: finalId,
      });
      const exceptions = await manager.find(DisputeReturnException, {
        where: { remedyKey: ctx.final.remedyKey },
        order: { createdAt: 'ASC' },
      });
      const claims = [];
      for (const exception of exceptions) {
        const acknowledgement = await manager.findOneBy(
          CarrierCompensationAcknowledgement,
          { exceptionId: exception.id },
        );
        const receipts = await manager.find(CarrierCompensationReceipt, {
          where: { exceptionId: exception.id },
          order: { createdAt: 'ASC' },
        });
        claims.push({ exception, acknowledgement, receipts });
      }
      const returned = await manager.findOneBy(DisputeReturn, {
        remedyKey: ctx.final.remedyKey,
      });
      const charges = returned
        ? await manager.find(ReturnShippingCharge, {
            where: { returnId: returned.id },
            order: { createdAt: 'ASC' },
          })
        : [];
      return {
        safety,
        reviewToken: await remedyReviewToken(manager, ctx),
        claims,
        charges,
      };
    });
  }
}
