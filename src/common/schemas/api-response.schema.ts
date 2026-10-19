import { z } from 'zod';

export const createApiSuccessSchema = <TDataSchema extends z.ZodType>(
  dataSchema: TDataSchema,
) =>
  z.object({
    statusCode: z.number().int(),
    message: z.string(),
    data: dataSchema,
  });
