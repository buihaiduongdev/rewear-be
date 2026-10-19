import { z } from 'zod';

export const createApiSuccessSchema = <TDataSchema extends z.ZodType>(
  dataSchema: TDataSchema,
  status: number,
) =>
  z.object({
    statusCode: z.literal(status),
    message: z.string(),
    data: dataSchema,
  });
