import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { ProductCondition } from '@/modules/product/enums';

import { CartAvailability } from '../enums/cart-availability.enum';

// Reject quantity/ownership fields even though PUT identifies the product in its path.
export const addCartItemSchema = z.strictObject({}).default({});

const cartProductSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  price: z.number().int().positive(),
  condition: z.enum(ProductCondition),
  size: z.string().nullable(),
  color: z.string().nullable(),
  coverUrl: z.url().nullable(),
});
const cartSourceSchema = z.object({
  type: z.enum(['USER', 'SHOP']),
  id: z.uuid(),
  name: z.string(),
});
const cartItemSchema = z.object({
  productId: z.uuid(),
  addedAt: dateTimeSchema,
  availability: z.enum(CartAvailability),
  product: cartProductSchema.nullable(),
});
export const cartSchema = z.object({
  groups: z.array(
    z.object({
      source: cartSourceSchema.nullable(),
      items: z.array(cartItemSchema),
    }),
  ),
  summary: z.object({
    itemCount: z.number().int().nonnegative(),
    availableItemCount: z.number().int().nonnegative(),
    totalPrice: z.number().int().nonnegative(),
    currency: z.literal('VND'),
  }),
});

export type CartView = z.input<typeof cartSchema>;
export type AddCartItemInput = z.output<typeof addCartItemSchema>;
