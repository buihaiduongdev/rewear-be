import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import { map, Observable } from 'rxjs';
import z from 'zod';

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  constructor(private readonly schema: z.ZodType) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          Array.isArray(data)
            ? z.array(this.schema).parse(data)
            : this.schema.parse(data),
        ),
      );
  }
}
