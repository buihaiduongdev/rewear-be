import z from 'zod';

import { paginatedSchema } from '@/common/pagination';
import { dateTimeSchema } from '@/common/schemas';

import { ProductCondition, ProductStatus } from '../enums';

export const productSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  sellerUserId: z.uuid().nullable(),
  shopId: z.uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  condition: z.enum(ProductCondition),
  size: z.string().nullable(),
  color: z.string().nullable(),
  brand: z.string().nullable(),
  price: z.number().int().min(0),
  status: z.enum(ProductStatus),
  publishedAt: dateTimeSchema.nullable(),
  heldUntil: dateTimeSchema.nullable(),
  soldAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  category: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  seller: z
    .object({
      id: z.uuid(),
      fullName: z.string(),
    })
    .nullable(),
  shop: z
    .object({
      id: z.uuid(),
      name: z.string(),
    })
    .nullable(),
});

export const productListSchema = paginatedSchema(productSchema);
