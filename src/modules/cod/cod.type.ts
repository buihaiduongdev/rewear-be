import type z from 'zod';

import type {
  COD_CANCELLATION_REASON,
  COD_RESTRICTION_CAUSE,
} from './cod.constants';
import type { cancelCodSchema, placeCodSchema } from './schemas/cod.schema';

export type CodRestrictionCause =
  (typeof COD_RESTRICTION_CAUSE)[keyof typeof COD_RESTRICTION_CAUSE];
export type CodCancellationReason =
  (typeof COD_CANCELLATION_REASON)[keyof typeof COD_CANCELLATION_REASON];

export type PlaceCodInput = z.output<typeof placeCodSchema>;

export type CancelCodInput = z.output<typeof cancelCodSchema>;
