import z from 'zod';

import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

export const verifyDeliverySchema = z.strictObject({
  deliveredAt: z.iso.datetime({ offset: true }),
  mode: z.enum(RECONCILIATION_MODE),
  reason: trimmedTextSchema.min(1).max(1000),
  evidence: trimmedTextSchema.min(1).max(2000),
});
