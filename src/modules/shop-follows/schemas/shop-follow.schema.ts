import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';
import { ProductCondition } from '@/modules/product/enums';
import { ShopStatus } from '@/modules/shop/enums';

import { SHOP_FOLLOW_POLICY } from '../constants/shop-follow.constant';

export const shopFollowQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SHOP_FOLLOW_POLICY.MAX_PAGE_SIZE)
    .default(SHOP_FOLLOW_POLICY.DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
export const shopFollowInputSchema = z.strictObject({}).default({});
export const shopFollowStateSchema = z.object({
  shopId: z.uuid(),
  following: z.boolean(),
  followedAt: dateTimeSchema.nullable(),
});
export const followedShopSchema = z.object({
  shopId: z.uuid(),
  followedAt: dateTimeSchema,
  shop: z.object({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(ShopStatus),
  }),
});
export const shopFollowPageSchema = z.object({
  items: z.array(followedShopSchema),
  totalCount: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export const followedProductSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  price: z.number().int().positive(),
  condition: z.enum(ProductCondition).nullable(),
  size: z.string().nullable(),
  coverUrl: z.url().nullable(),
  publishedAt: dateTimeSchema,
  shop: z.object({ id: z.uuid(), name: z.string() }),
});
export const shopFollowProductPageSchema = z.object({
  items: z.array(followedProductSchema),
  totalCount: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});
