import z from 'zod';

export const measurementsSchema = z.strictObject({
  chest: z.number().positive().max(500).optional(),
  waist: z.number().positive().max(500).optional(),
  hip: z.number().positive().max(500).optional(),
  length: z.number().positive().max(500).optional(),
  shoulder: z.number().positive().max(500).optional(),
  sleeve: z.number().positive().max(500).optional(),
  inseam: z.number().positive().max(500).optional(),
});
export const requiredMeasurementsSchema = z
  .array(measurementsSchema.keyof())
  .max(7)
  .refine(
    (keys) => new Set(keys).size === keys.length,
    'Duplicate measurement keys',
  );
export type MeasurementKey = keyof z.output<typeof measurementsSchema>;
