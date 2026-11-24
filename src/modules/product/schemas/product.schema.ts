import z from 'zod';

import { paginatedSchema } from '@/common/pagination';
import { dateTimeSchema } from '@/common/schemas';
import { shippingPackageSchema } from '@/common/schemas/shipping-package.schema';

import {
  ProductCondition,
  ProductModerationStatus,
  ProductStatus,
} from '../enums';
import { defectSchema, measurementsSchema } from './product-input.schema';

export const productSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid().nullable(),
  shopId: z.uuid(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  condition: z.enum(ProductCondition).nullable(),
  size: z.string().nullable(),
  color: z.string().nullable(),
  brand: z.string().nullable(),
  price: z.number().int().min(0).nullable(),
  measurements: measurementsSchema,
  shippingPackage: shippingPackageSchema.nullable().default(null),
  repairs: z.string().nullable(),
  defects: z.array(defectSchema),
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
  shop: z.object({
    identitySalesPaused: z.boolean().default(false),
    id: z.uuid(),
    name: z.string(),
    logoUrl: z.string().nullable().default(null),
  }),
});

export const productListSchema = paginatedSchema(productSchema);

export const productModerationSchema = z.object({
  productId: z.uuid(),
  status: z.enum(ProductModerationStatus),
  version: z.number().int().positive(),
  reason: z.string().nullable(),
});
