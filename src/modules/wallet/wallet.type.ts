import type z from 'zod';

import type { walletQuerySchema } from './schemas/wallet.schema';
import { WALLET_CREDIT_REASON } from './wallet.constants';

export type WalletCreditReason =
  (typeof WALLET_CREDIT_REASON)[keyof typeof WALLET_CREDIT_REASON];
export type WalletQueryInput = z.output<typeof walletQuerySchema>;
