import z from 'zod';

import { EPaginationOrder, PAGINATION_DEFAULT } from '@/common/constants';

const queryNumber = z
  .union([z.string().trim().regex(/^\d+$/), z.number()])
  .transform((value) => Number(value));
const positiveInteger = z.number().int().min(1);

export const paginationQuerySchema = z.strictObject({
  page: queryNumber.pipe(positiveInteger).default(PAGINATION_DEFAULT.PAGE),
  pageSize: queryNumber
    .pipe(positiveInteger.max(PAGINATION_DEFAULT.PAGE_SIZE_MAX))
    .default(PAGINATION_DEFAULT.PAGE_SIZE),
  order: z.enum(EPaginationOrder).default(EPaginationOrder.DESC),
  sortBy: z.string().trim().optional(),
  search: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ' '))
    .optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPage: z.number().int().min(0),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    meta: paginationMetaSchema,
  });
}
