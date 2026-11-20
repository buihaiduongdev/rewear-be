import type z from 'zod';

import type {
  feeCarrierRefundSchema,
  feeWalletPaymentSchema,
} from '../schemas/fee-settlement.schema';

export type FeeWalletPaymentInput = z.infer<typeof feeWalletPaymentSchema>;
export type FeeCarrierRefundInput = z.infer<typeof feeCarrierRefundSchema>;
