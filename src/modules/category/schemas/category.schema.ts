import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { requiredMeasurementsSchema } from '@/common/schemas/measurements.schema';

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  requiredMeasurements: requiredMeasurementsSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const categoryListSchema = z.array(categorySchema);
