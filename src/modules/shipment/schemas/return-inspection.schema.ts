import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { orderSchema } from '@/modules/order/order.schema';

import { RETURN_INSPECTION_CONDITION } from '../shipment.constants';

export const returnInspectionSchema = z.strictObject({
  condition: z.enum(RETURN_INSPECTION_CONDITION),
  reason: trimmedTextSchema.min(1).max(1000),
  evidence: trimmedTextSchema.min(1).max(2000),
});

export const returnInspectionViewSchema = z.object({
  order: orderSchema,
  inspection: returnInspectionSchema
    .extend({
      id: z.uuid(),
      orderId: z.uuid(),
      actorId: z.uuid(),
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema,
    })
    .nullable(),
  requiresAdmin: z.boolean(),
});

export type { ReturnInspectionInput } from '../shipment.type';
