import z from 'zod';

import {
  MAX_SAFE_BALANCE,
  MAX_VND_AMOUNT,
} from '@/common/constants/money.constant';

export const vndAmountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_VND_AMOUNT);
export const safeBalanceSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_SAFE_BALANCE);
