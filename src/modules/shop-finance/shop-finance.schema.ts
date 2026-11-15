import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import {
  RECONCILIATION_MODE,
  SHOP_LEDGER_TYPE,
} from '@/modules/cod-reconciliation/cod-reconciliation.constants';
import {
  collectionViewSchema,
  vndSchema,
} from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

export const shopFinanceViewSchema = z.object({
  shopId: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  held: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  receivable: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  available: z.literal(0),
  entries: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      type: z.enum(SHOP_LEDGER_TYPE),
      amount: vndSchema,
      createdAt: dateTimeSchema,
    }),
  ),
  collections: z.array(collectionViewSchema),
});
