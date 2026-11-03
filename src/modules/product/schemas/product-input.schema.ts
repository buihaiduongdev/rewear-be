import z from 'zod';

import { measurementsSchema } from '@/common/schemas/measurements.schema';
import {
  optionalInput,
  trimmedTextSchema,
  uuidSchema,
} from '@/common/schemas/request.schema';
import { shippingPackageSchema } from '@/common/schemas/shipping-package.schema';

import { ProductCondition, ProductStatus } from '../enums';

export { measurementsSchema } from '@/common/schemas/measurements.schema';

export const defectSchema = z.strictObject({
  description: trimmedTextSchema.min(1).max(1000),
  mediaIds: z
    .array(uuidSchema)
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate media ids'),
});

export const createProductSchema = z.strictObject({
  categoryId: optionalInput(uuidSchema).nullable().optional(),
  shopId: optionalInput(uuidSchema),
  title: trimmedTextSchema.min(1).max(150).nullish(),
  description: trimmedTextSchema.max(5000).nullish(),
  condition: z.enum(ProductCondition).nullish(),
  size: trimmedTextSchema.max(50).nullish(),
  color: trimmedTextSchema.max(50).nullish(),
  brand: trimmedTextSchema.max(100).nullish(),
  price: z.number().int().min(0).max(2147483647).nullish(),
  measurements: measurementsSchema.optional(),
  shippingPackage: shippingPackageSchema.nullish(),
  repairs: trimmedTextSchema.max(2000).nullish(),
  defects: z.array(defectSchema).max(20).optional(),
});

export const updateProductSchema = createProductSchema
  .omit({ shopId: true })
  .partial();
export const updateProductStatusSchema = z.strictObject({
  status: z.enum([ProductStatus.ACTIVE, ProductStatus.HIDDEN]),
});
export const moderateProductSchema = z
  .strictObject({
    revision: z.number().int().positive(),
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: trimmedTextSchema.min(1).max(2000).optional(),
  })
  .refine((input) => input.decision !== 'REJECT' || !!input.reason, {
    message: 'A rejection reason is required',
    path: ['reason'],
  });
export const suspendProductSchema = z.strictObject({
  reason: trimmedTextSchema.min(1).max(2000),
});
export type CreateProductInput = z.output<typeof createProductSchema>;
export type UpdateProductInput = z.output<typeof updateProductSchema>;
export type UpdateProductStatusInput = z.output<
  typeof updateProductStatusSchema
>;
export type ModerateProductInput = z.output<typeof moderateProductSchema>;
export type SuspendProductInput = z.output<typeof suspendProductSchema>;
