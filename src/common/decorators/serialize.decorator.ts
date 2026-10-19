import { applyDecorators, HttpStatus, UseInterceptors } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

import type { ZodType } from 'zod';

import { SerializeInterceptor } from '../interceptors';
import { createApiSuccessSchema } from '../schemas';

type SerializeOptions = {
  status?: HttpStatus;
  description?: string;
};

export const Serialize = (
  schema: ZodType,
  options: SerializeOptions = {},
): MethodDecorator =>
  applyDecorators(
    UseInterceptors(new SerializeInterceptor(schema)),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description ?? 'Successful response',
      standardSchema: createApiSuccessSchema(schema),
    }),
  );
