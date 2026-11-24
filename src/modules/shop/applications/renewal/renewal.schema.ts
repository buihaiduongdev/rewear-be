import z from 'zod';

import { SHOP_APPLICATION_POLICY } from '../constants/shop-application.constant';
import {
  applicantIdentitySchema,
  applicationCreateSchema,
} from '../schemas/shop-application.schema';

export const createIdentityRenewalSchema = applicationCreateSchema;
export const submitIdentityRenewalSchema = z.strictObject({
  requestId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  identity: applicantIdentitySchema,
  documentIds: z
    .array(z.uuid())
    .min(1)
    .max(SHOP_APPLICATION_POLICY.MAX_DOCUMENTS)
    .refine((ids) => new Set(ids).size === ids.length),
});
