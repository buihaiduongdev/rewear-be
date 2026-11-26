import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';

import type { Response } from 'express';
import { map, Observable } from 'rxjs';

import type { TApiSuccessResponse } from '../types';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  T | TApiSuccessResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<T | TApiSuccessResponse<T>> {
    if (Reflect.getMetadata(SSE_METADATA, context.getHandler())) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: T): TApiSuccessResponse<T> => ({
        statusCode: response.statusCode,
        message: 'OK',
        data,
      })),
    );
  }
}
