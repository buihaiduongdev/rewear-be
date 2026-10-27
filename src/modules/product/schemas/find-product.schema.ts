import z from 'zod';

import { paginationQuerySchema } from '@/common/pagination';

import { ProductCondition, ProductStatus } from '../enums';

const queryPrice = z
  .union([z.string().trim().regex(/^\d+$/), z.number()])
  .transform((value) => Number(value))
  .pipe(z.number().int().min(0).max(2147483647));

const productFilters = {
  search: z.string().trim().min(1).max(150).optional(),
  categoryId: z.uuid().optional(),
  shopId: z.uuid().optional(),
  sellerUserId: z.uuid().optional(),
  condition: z.enum(ProductCondition).optional(),
  size: z.string().trim().min(1).max(50).optional(),
  color: z.string().trim().min(1).max(50).optional(),
  brand: z.string().trim().min(1).max(100).optional(),
  minPrice: queryPrice.optional(),
  maxPrice: queryPrice.optional(),
};

export const findProductSchema = paginationQuerySchema
  .extend(productFilters)
  .refine(
    ({ minPrice, maxPrice }) =>
      minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice' },
  );

export const findMyProductSchema = paginationQuerySchema
  .extend({
    ...productFilters,
    status: z.enum(ProductStatus).optional(),
  })
  .refine(
    ({ minPrice, maxPrice }) =>
      minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice' },
  );

export type FindProductQuery = z.infer<typeof findProductSchema>;
export type FindMyProductQuery = z.infer<typeof findMyProductSchema>;
