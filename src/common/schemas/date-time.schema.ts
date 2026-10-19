import { z } from 'zod';

export const dateTimeSchema = z.preprocess(
  (value) =>
    value instanceof Date && !Number.isNaN(value.getTime())
      ? value.toISOString()
      : value,
  z.iso.datetime(),
);
