import z from 'zod';

export const createMediaUploadTicketSchema = z.strictObject({
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().min(1),
});

export const confirmMediaUploadSchema = createMediaUploadTicketSchema.extend({
  storageKey: z.string().max(512),
});

export const reorderMediaSchema = z.strictObject({
  mediaIds: z
    .array(z.uuidv4())
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'mediaIds must contain unique values',
    })
    .meta({ uniqueItems: true }),
});

export type CreateMediaUploadTicketInput = z.output<
  typeof createMediaUploadTicketSchema
>;
export type ConfirmMediaUploadInput = z.output<typeof confirmMediaUploadSchema>;
export type ReorderMediaInput = z.output<typeof reorderMediaSchema>;
