import z from 'zod';

export const uuidSchema = z.uuid();
export const emailSchema = z.email().max(255);

// Matches the existing Trim decorator without changing internal whitespace rules.
export const trimmedTextSchema = z
  .string()
  .trim()
  .overwrite((value) => value.replace(/\s+/g, ' '));

// IsOptional previously skipped both null and undefined for non-nullable fields.
export const optionalInput = <T extends z.ZodType>(schema: T) =>
  schema
    .nullish()
    .transform((value) => value ?? undefined)
    .optional();
