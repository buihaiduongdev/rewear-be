import type z from 'zod';

import type { verifyDeliverySchema } from '../schemas/order-settlement.schema';

export type VerifyDeliveryInput = z.output<typeof verifyDeliverySchema>;
