import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { CodRemittance } from '@/modules/cod-reconciliation/entities';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';

import { DISPUTE_RESPONSIBILITY } from '../constants/dispute.constant';
import {
  CARRIER_DIRECTION,
  CARRIER_RECEIPT_KIND,
  RETURN_EXCEPTION_KIND,
  RETURN_FEE_KIND,
} from './constants/return-exception.constant';
import { RETURN_STATE } from './constants/return.constant';
import { CarrierCompensationAcknowledgement } from './entities/carrier-compensation-acknowledgement.entity';
import { CarrierCompensationReceipt } from './entities/carrier-compensation-receipt.entity';
import { DisputeReturnException } from './entities/dispute-return-exception.entity';
import { DisputeReturn } from './entities/dispute-return.entity';
import { ReturnShippingCharge } from './entities/return-shipping-charge.entity';
import {
  linkRemedyEvidence,
  remedyReviewToken,
  runRemedyCommand,
} from './return-remedy.access';
import {
  carrierAcknowledgementSchema,
  carrierExceptionSchema,
  carrierReceiptSchema,
  returnShippingChargeSchema,
} from './schemas/return-exception.schema';

@Injectable()
export class ReturnCarrierService {
  constructor(private readonly db: DataSource) {}
  verify(adminId: string, finalId: string, input: unknown) {
    const data = carrierExceptionSchema.parse(input);
    return runRemedyCommand(
      this.db,
      adminId,
      finalId,
      'CARRIER_VERIFIED',
      data,
      true,
      DisputeReturnException,
      async (manager, ctx, now) => {
        if (
          await manager.existsBy(DisputeReturnException, {
            remedyKey: ctx.final.remedyKey,
            direction: data.direction,
          })
        )
          throw new ConflictException(
            'Carrier/return exception already verified for this item and leg',
          );
        const occurredAt = new Date(data.occurredAt);
        if (occurredAt > now || occurredAt < ctx.order.createdAt)
          throw new ConflictException(
            'Exception timestamp outside order history',
          );
        if (data.reviewToken !== (await remedyReviewToken(manager, ctx)))
          throw new ConflictException(
            'Return exception review changed; reload evidence',
          );
        let returned: DisputeReturn | null = null;
        if (data.direction === CARRIER_DIRECTION.RETURN) {
          returned = await manager.findOneByOrFail(DisputeReturn, {
            remedyKey: ctx.final.remedyKey,
          });
          const validHandover =
            returned.handoverAt &&
            returned.handoverBy &&
            returned.handoverAt <= returned.handoverBy &&
            returned.handoverAt <= occurredAt;
          const sameLeg =
            returned.labelCode === data.waybillCode &&
            returned.mode === data.mode &&
            returned.state !== RETURN_STATE.EXPIRED;
          if (!validHandover || !sameLeg)
            throw new ConflictException(
              'Verified timely return handover and matching waybill/mode required',
            );
        } else {
          const shipment = await manager.findOneByOrFail(Shipment, {
            orderId: ctx.order.id,
          });
          const outboundFinding =
            ctx.final.responsibility === DISPUTE_RESPONSIBILITY.CARRIER &&
            data.kind !== RETURN_EXCEPTION_KIND.SELLER_REFUSAL;
          if (!outboundFinding || shipment.orderCode !== data.waybillCode)
            throw new ConflictException(
              'Outbound carrier remedy must match the final carrier finding and original waybill',
            );
        }
        const row = await manager.save(
          DisputeReturnException,
          manager.create(DisputeReturnException, {
            finalDecisionId: finalId,
            orderId: ctx.order.id,
            shopId: ctx.order.shopId,
            remedyKey: ctx.final.remedyKey,
            returnId: returned?.id ?? null,
            direction: data.direction,
            kind: data.kind,
            mode: data.mode,
            waybillCode: data.waybillCode,
            occurredAt,
            reason: data.reason,
            dispositionInstructions: data.dispositionInstructions,
            evidenceIds: data.evidenceIds,
            verifiedBy: adminId,
            createdAt: now,
          }),
        );
        await linkRemedyEvidence(
          manager,
          ctx.order.id,
          row.id,
          data.evidenceIds,
        );
        return row;
      },
    );
  }
  async acknowledge(adminId: string, claimId: string, input: unknown) {
    const claim = await this.db.manager.findOneByOrFail(
      DisputeReturnException,
      { id: claimId },
    );
    const finalId = claim.finalDecisionId;
    const data = carrierAcknowledgementSchema.parse(input);
    return runRemedyCommand(
      this.db,
      adminId,
      finalId,
      'CARRIER_ACKNOWLEDGED',
      { ...data, claimId },
      true,
      CarrierCompensationAcknowledgement,
      async (manager, _ctx, now) => {
        const exception = await manager.findOneByOrFail(
          DisputeReturnException,
          { id: claimId },
        );
        if (exception.kind === RETURN_EXCEPTION_KIND.SELLER_REFUSAL)
          throw new ConflictException(
            'Seller refusal is not a carrier compensation award',
          );
        if (
          await manager.existsBy(CarrierCompensationAcknowledgement, {
            exceptionId: exception.id,
          })
        )
          throw new ConflictException('Carrier acknowledgement is immutable');
        return manager.save(
          CarrierCompensationAcknowledgement,
          manager.create(CarrierCompensationAcknowledgement, {
            exceptionId: exception.id,
            amount: data.amount,
            conditions: data.conditions,
            evidence: data.evidence,
            actorId: adminId,
            createdAt: now,
          }),
        );
      },
    );
  }
  async receive(adminId: string, claimId: string, input: unknown) {
    const claim = await this.db.manager.findOneByOrFail(
      DisputeReturnException,
      { id: claimId },
    );
    const finalId = claim.finalDecisionId;
    const data = carrierReceiptSchema.parse(input);
    return runRemedyCommand(
      this.db,
      adminId,
      finalId,
      'CARRIER_RECEIVED',
      { ...data, claimId },
      true,
      CarrierCompensationReceipt,
      async (manager, _ctx, now) => {
        const exception = await manager.findOneByOrFail(
          DisputeReturnException,
          { id: claimId, finalDecisionId: finalId },
        );
        const acknowledgement = await manager.findOneByOrFail(
          CarrierCompensationAcknowledgement,
          { exceptionId: exception.id },
        );
        if (data.mode !== exception.mode)
          throw new ConflictException(
            'Compensation receipt mode does not match verified source',
          );
        const receivedAt = new Date(data.receivedAt);
        if (receivedAt > now || receivedAt < exception.occurredAt)
          throw new ConflictException(
            'Receipt timestamp outside claim history',
          );
        if (
          await manager.existsBy(CodRemittance, {
            mode: data.mode,
            reference: data.reference,
          })
        )
          throw new ConflictException(
            'Receipt reference already allocated to COD remittance',
          );
        if (
          await manager.existsBy(CarrierCompensationReceipt, {
            mode: data.mode,
            reference: data.reference,
          })
        )
          throw new ConflictException(
            'Compensation receipt reference already allocated',
          );
        const receipts = await manager.find(CarrierCompensationReceipt, {
          where: { exceptionId: exception.id },
        });
        const exceedsAcknowledgement =
          receipts.reduce((sum, r) => sum + r.amount, 0) + data.amount >
          acknowledgement.amount;
        if (exceedsAcknowledgement)
          throw new ConflictException(
            'Compensation receipt exceeds carrier acknowledged amount',
          );
        await this.validateNettingCharge(manager, exception, data);
        return manager.save(
          CarrierCompensationReceipt,
          manager.create(CarrierCompensationReceipt, {
            exceptionId: exception.id,
            shopId: exception.shopId,
            orderId: exception.orderId,
            chargeId: data.chargeId ?? null,
            mode: data.mode,
            reference: data.reference,
            kind: data.kind,
            amount: data.amount,
            receivedAt,
            evidence: data.evidence,
            actorId: adminId,
            createdAt: now,
          }),
        );
      },
    );
  }
  charge(adminId: string, finalId: string, input: unknown) {
    const data = returnShippingChargeSchema.parse(input);
    return runRemedyCommand(
      this.db,
      adminId,
      finalId,
      'RETURN_SHIPPING_CHARGED',
      data,
      true,
      ReturnShippingCharge,
      async (manager, ctx, now) => {
        const returned = await manager.findOneByOrFail(DisputeReturn, {
          remedyKey: ctx.final.remedyKey,
        });
        if (returned.mode !== data.mode || !returned.labelCode)
          throw new ConflictException(
            'Return fee requires matching verified return label/source',
          );
        if (
          data.kind === RETURN_FEE_KIND.STANDARD &&
          ctx.final.responsibility !== DISPUTE_RESPONSIBILITY.SELLER
        )
          throw new ConflictException(
            'Standard return fee requires a seller-fault final finding',
          );
        if (
          data.kind === RETURN_FEE_KIND.REFUSAL_EXTRA &&
          !(await manager.existsBy(DisputeReturnException, {
            returnId: returned.id,
            kind: RETURN_EXCEPTION_KIND.SELLER_REFUSAL,
            mode: data.mode,
          }))
        )
          throw new ConflictException(
            'Extra return fee requires verified unjustified seller refusal',
          );
        return manager.save(
          ReturnShippingCharge,
          manager.create(ReturnShippingCharge, {
            returnId: returned.id,
            orderId: ctx.order.id,
            shopId: ctx.order.shopId,
            waybillCode: returned.labelCode,
            mode: data.mode,
            kind: data.kind,
            amount: data.amount,
            invoiceReference: data.invoiceReference,
            reason: data.reason,
            evidence: data.evidence,
            actorId: adminId,
            createdAt: now,
          }),
        );
      },
    );
  }
  private async validateNettingCharge(
    manager: EntityManager,
    exception: DisputeReturnException,
    data: {
      chargeId?: string;
      mode: CarrierCompensationReceipt['mode'];
      amount: number;
    },
  ) {
    if (data.chargeId) {
      const charge = await manager.findOneByOrFail(ReturnShippingCharge, {
        id: data.chargeId,
        shopId: exception.shopId,
        orderId: exception.orderId,
        mode: exception.mode,
      });
      const returned = await manager.findOneByOrFail(DisputeReturn, {
        id: charge.returnId,
      });
      if (returned.remedyKey !== exception.remedyKey)
        throw new ConflictException(
          'Netting charge must belong to the same item remedy',
        );
      const netted = await manager.find(CarrierCompensationReceipt, {
        where: {
          chargeId: charge.id,
          mode: data.mode,
          kind: CARRIER_RECEIPT_KIND.VERIFIED_NETTING,
        },
      });
      if (
        netted.reduce((sum, r) => sum + r.amount, 0) + data.amount >
        charge.amount
      )
        throw new ConflictException(
          'Netting exceeds the verified outstanding return charge',
        );
    }
  }
}
