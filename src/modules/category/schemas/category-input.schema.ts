import z from 'zod';

import { requiredMeasurementsSchema } from '@/common/schemas/measurements.schema';
import { optionalInput } from '@/common/schemas/request.schema';

export const createCategorySchema = z.strictObject({
  name: z.string().min(1).max(100).regex(/\S/),
  slug: optionalInput(
    z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ),
  requiredMeasurements: requiredMeasurementsSchema.optional(),
  isActive: optionalInput(z.boolean()),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  name: optionalInput(createCategorySchema.shape.name),
});

export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;
