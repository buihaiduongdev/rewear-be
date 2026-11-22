import { ConflictException, NotFoundException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';
import {
  FEE_COLLECTION_METHOD,
  FEE_PARTY,
  FEE_REFUND_STATE,
} from '@/modules/fees/constants/fee.constant';
import { FeeAssessment, FeeRefund } from '@/modules/fees/entities/fee.entity';

import { WalletCredit } from '../../entities/wallet.entity';
import { EXCESS_SOURCE } from '../constants/excess.constant';
import type { ExcessSource } from '../types/excess.type';

export async function excessSource(
  manager: EntityManager,
  type: ExcessSource,
  id: string,
) {
  if (type === EXCESS_SOURCE.CANCELLATION) {
    const source = await manager.findOneBy(WalletCredit, { id });
    if (!source) throw new NotFoundException('Wallet refund source not found');
    if (!source.mode)
      throw new ConflictException('Unqualified refund requires reconciliation');
    return { buyerId: source.userId, mode: source.mode, amount: source.amount };
  }
  if (type === EXCESS_SOURCE.DISPUTE) {
    const source = await manager.findOneBy(DisputeRefundCredit, { id });
    if (!source) throw new NotFoundException('Wallet refund source not found');
    return {
      buyerId: source.buyerId,
      mode: source.mode,
      amount: source.amount,
    };
  }
  const source = await manager.findOneBy(FeeRefund, {
    id,
    method: FEE_COLLECTION_METHOD.WALLET,
    state: FEE_REFUND_STATE.SUCCEEDED,
  });
  if (!source)
    throw new NotFoundException('Completed wallet fee refund not found');
  const fee = await manager.findOneByOrFail(FeeAssessment, {
    id: source.feeId,
    party: FEE_PARTY.BUYER,
    mode: source.mode,
  });
  return { buyerId: fee.buyerId, mode: source.mode, amount: source.amount };
}
