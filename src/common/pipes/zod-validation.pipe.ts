import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

import type z from 'zod';

@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<T>
> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        errors: result.error.issues.map(({ path, message, code }) => ({
          path,
          message,
          code,
        })),
      });
    }
    return result.data;
  }
}
