import { UseInterceptors } from '@nestjs/common';

import type { ZodType } from 'zod';

import { SerializeInterceptor } from '../interceptors';

export const Serialize = (schema: ZodType): MethodDecorator & ClassDecorator =>
  UseInterceptors(new SerializeInterceptor(schema));
