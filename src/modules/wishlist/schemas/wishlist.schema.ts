import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { CartAvailability } from '@/modules/cart/enums/cart-availability.enum';
import { ProductCondition } from '@/modules/product/enums';

export const addWishlistItemSchema = z.strictObject({}).default({});

export const wishlistItemProductSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  price: z.number().int().positive(),
  condition: z.enum(ProductCondition),
  size: z.string().nullable(),
  color: z.string().nullable(),
  coverUrl: z.url().nullable(),
  shop: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});

export const wishlistItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  addedAt: dateTimeSchema,
  availability: z.enum(CartAvailability),
  product: wishlistItemProductSchema.nullable(),
});

export const wishlistSchema = z.object({
  items: z.array(wishlistItemSchema),
  totalCount: z.number().int().nonnegative(),
});

export type WishlistView = z.input<typeof wishlistSchema>;
export type AddWishlistItemInput = z.output<typeof addWishlistItemSchema>;
