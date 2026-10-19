import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import { map, Observable } from 'rxjs';
import type { ZodType } from 'zod';

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  constructor(private readonly schema: ZodType) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => this.schema.parse(data)));
  }
}
