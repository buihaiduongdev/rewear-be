import z from 'zod';

// Serialize the library response while filtering entity fields.
export function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: z.object({
      itemsPerPage: z.number(),
      totalItems: z.number().optional(),
      currentPage: z.number().optional(),
      totalPages: z.number().optional(),
      sortBy: z.array(
        z.tuple([z.union([z.string(), z.array(z.string())]), z.string()]),
      ),
      searchBy: z.array(z.string()).optional(),
      search: z.string().optional(),
      select: z.array(z.string()).optional(),
      filter: z
        .record(z.string(), z.union([z.string(), z.array(z.string())]))
        .optional(),
      cursor: z.string().optional(),
    }),
    links: z.object({
      first: z.string().optional(),
      previous: z.string().optional(),
      current: z.string(),
      next: z.string().optional(),
      last: z.string().optional(),
    }),
  });
}
