import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { walletPoolFields } from '@/modules/wallet/checkout/policies/wallet-checkout.policy';
import { WalletAccount } from '@/modules/wallet/entities/wallet.entity';
import { verifiedWalletFunds } from '@/modules/wallet/verified-wallet-funds';

import { FEE_COLLECTION_METHOD, FEE_PARTY } from '../constants/fee.constant';
import { FeeAssessment } from '../entities/fee.entity';
import { feeOutstanding, recordFeeCollection } from '../fee-accounting';
import { FeeWalletDebit } from './entities/fee-settlement.entity';
import { assertFeeBuyer, feeMoneyLock } from './fee-settlement.access';
import { feeWalletPaymentSchema } from './schemas/fee-settlement.schema';
import type { FeeWalletPaymentInput } from './types/fee-settlement.type';

@Injectable()
export class FeeWalletService {
  constructor(private readonly db: DataSource) {}

  pay(buyerId: string, feeId: string, input: FeeWalletPaymentInput) {
    const data = feeWalletPaymentSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await feeMoneyLock(manager);
      const fee = await manager.findOneByOrFail(FeeAssessment, {
        id: feeId,
        buyerId,
        party: FEE_PARTY.BUYER,
      });
      await assertFeeBuyer(manager, buyerId);
      const previous = await manager.findOneBy(FeeWalletDebit, {
        buyerId,
        requestId: data.requestId,
      });
      if (previous) {
        const sameRequest =
          previous.feeId === feeId && previous.amount === data.expectedAmount;
        if (!sameRequest)
          throw new ConflictException('Wallet fee request ID already used');
        return {
          id: previous.id,
          feeId,
          mode: previous.mode,
          amount: previous.amount,
        };
      }
      const amount = await feeOutstanding(manager, feeId);
      if (amount <= 0 || amount !== data.expectedAmount)
        throw new ConflictException(
          'Review the current fee amount before payment',
        );
      const funds = await verifiedWalletFunds(manager, buyerId, fee.mode);
      if (funds.spendable < amount)
        throw new ConflictException('Insufficient verified wallet funds');
      const account = await manager.findOneByOrFail(WalletAccount, {
        userId: buyerId,
      });
      const [field] = walletPoolFields(fee.mode);
      account[field] -= amount;
      const debit = await manager.save(
        FeeWalletDebit,
        manager.create(FeeWalletDebit, {
          buyerId,
          feeId,
          requestId: data.requestId,
          mode: fee.mode,
          amount,
        }),
      );
      await recordFeeCollection(
        manager,
        {
          feeId,
          mode: fee.mode,
          method: FEE_COLLECTION_METHOD.WALLET,
          sourceId: debit.id,
          amount,
        },
        now,
      );
      await manager.save(account);
      return { id: debit.id, feeId, mode: debit.mode, amount };
    });
  }
}
