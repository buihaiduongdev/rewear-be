import z from 'zod';

import {
  optionalInput,
  trimmedTextSchema,
  uuidSchema,
} from '@/common/schemas/request.schema';

import { ProductCondition, ProductStatus } from '../enums';

export const createProductSchema = z.strictObject({
  categoryId: uuidSchema,
  shopId: optionalInput(uuidSchema),
  title: trimmedTextSchema.min(1).max(150),
  description: trimmedTextSchema.max(5000).nullish(),
  condition: z.enum(ProductCondition),
  size: trimmedTextSchema.max(50).nullish(),
  color: trimmedTextSchema.max(50).nullish(),
  brand: trimmedTextSchema.max(100).nullish(),
  price: z.number().int().min(0).max(2147483647),
});

export const updateProductSchema = createProductSchema
  .omit({ shopId: true })
  .partial()
  .extend({
    categoryId: optionalInput(createProductSchema.shape.categoryId),
    title: optionalInput(createProductSchema.shape.title),
    condition: optionalInput(createProductSchema.shape.condition),
    price: optionalInput(createProductSchema.shape.price),
  });

export const updateProductStatusSchema = z.strictObject({
  status: z.enum([
    ProductStatus.ACTIVE,
    ProductStatus.HIDDEN,
    ProductStatus.SOLD,
  ]),
});

export type CreateProductInput = z.output<typeof createProductSchema>;
export type UpdateProductInput = z.output<typeof updateProductSchema>;
export type UpdateProductStatusInput = z.output<
  typeof updateProductStatusSchema
>;
