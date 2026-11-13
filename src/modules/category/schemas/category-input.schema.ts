import z from 'zod';

import { requiredMeasurementsSchema } from '@/common/schemas/measurements.schema';
import {
  optionalInput,
  trimmedTextSchema,
} from '@/common/schemas/request.schema';

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const categoryNameSchema = trimmedTextSchema
  .min(1)
  .max(100)
  .refine((name) => {
    const slug = slugFromName(name);
    return slug.length > 0 && slug.length <= 120;
  }, 'Category name must produce a valid slug');

const categoryInputSchema = z.strictObject({
  name: categoryNameSchema,
  requiredMeasurements: requiredMeasurementsSchema.optional(),
  isActive: optionalInput(z.boolean()),
});

export const createCategorySchema = categoryInputSchema.transform((input) => ({
  ...input,
  slug: slugFromName(input.name),
}));

export const updateCategorySchema = categoryInputSchema
  .partial()
  .extend({ name: optionalInput(categoryInputSchema.shape.name) })
  .transform((input) => ({
    ...input,
    ...(input.name === undefined ? {} : { slug: slugFromName(input.name) }),
  }));

export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;
