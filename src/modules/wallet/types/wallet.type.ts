import type z from 'zod';

import { WALLET_CREDIT_REASON } from '../constants/wallet.constant';
import type { walletQuerySchema } from '../schemas/wallet.schema';

export type WalletCreditReason =
  (typeof WALLET_CREDIT_REASON)[keyof typeof WALLET_CREDIT_REASON];
export type WalletQueryInput = z.output<typeof walletQuerySchema>;
