import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { WalletAccount } from '../entities';
import { WALLET_HOLD_STATE } from './constants/wallet-checkout.constant';
import { WalletCheckoutHold } from './entities';
import { walletPoolFields } from './policies/wallet-checkout.policy';

export async function releaseWalletHold(
  manager: EntityManager,
  hold: WalletCheckoutHold,
  now: Date,
  state: typeof WALLET_HOLD_STATE.RELEASED | typeof WALLET_HOLD_STATE.EXPIRED,
) {
  if (hold.state !== WALLET_HOLD_STATE.HELD) return;
  const account = await manager.findOneOrFail(WalletAccount, {
    where: { userId: hold.buyerId },
    lock: { mode: 'pessimistic_write' },
  });
  const [available, held] = walletPoolFields(hold.mode);
  if (account[held] < hold.amount)
    throw new ConflictException('Wallet held balance requires reconciliation');
  account[held] -= hold.amount;
  account[available] += hold.amount;
  await manager.save(account);
  hold.state = state;
  hold.releasedAt = now;
  await manager.save(hold);
}
