import z from 'zod';

import { paginatedSchema } from '@/common/pagination';
import { dateTimeSchema } from '@/common/schemas';

import { ProductCondition, ProductStatus } from '../enums';
import { defectSchema, measurementsSchema } from './product-input.schema';

export const productSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid().nullable(),
  sellerUserId: z.uuid().nullable(),
  shopId: z.uuid().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  condition: z.enum(ProductCondition).nullable(),
  size: z.string().nullable(),
  color: z.string().nullable(),
  brand: z.string().nullable(),
  price: z.number().int().min(0).nullable(),
  measurements: measurementsSchema,
  repairs: z.string().nullable(),
  defects: z.array(defectSchema),
  revision: z.number().int().positive(),
  approvedRevision: z.number().int().positive().nullable(),
  coverUrl: z.url().nullable(),
  mediaCount: z.number().int().nonnegative(),
  status: z.enum(ProductStatus),
  publishedAt: dateTimeSchema.nullable(),
  heldUntil: dateTimeSchema.nullable(),
  soldAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  category: z
    .object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
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

export const productRevisionSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  revision: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
  submittedById: z.uuid(),
  decision: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED']),
  reviewedById: z.uuid().nullable(),
  reason: z.string().nullable(),
  reviewedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const productRevisionListSchema = z.array(productRevisionSchema);
