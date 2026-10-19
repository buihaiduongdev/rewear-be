import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const categoryListSchema = z.array(categorySchema);
