import type z from 'zod';

import type { RATING_MODES } from '../constants/rating.constant';
import type {
  ratingInputSchema,
  ratingModerationSchema,
  ratingUploadSchema,
} from '../schemas/rating.schema';

export type RatingMode = (typeof RATING_MODES)[number];
export type RatingInput = z.infer<typeof ratingInputSchema>;
export type RatingModerationInput = z.infer<typeof ratingModerationSchema>;
export type RatingUploadInput = z.infer<typeof ratingUploadSchema>;
