import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { EntityNotFoundError } from 'typeorm';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.debug({
          requestId: request.headers['x-request-id'],
          statusCode: response.statusCode,
          method: request.method,
          originalUrl: request.originalUrl,
          msResponseTime: Date.now() - startTime,
          userAgent: request.get('user-agent') ?? '',
        });
      }),
      catchError((exception: unknown) => {
        const statusCode = this.getStatusCode(exception);

        response.locals.errorLogged = true;
        const details = {
          requestId: request.headers['x-request-id'],
          statusCode,
          method: request.method,
          originalUrl: request.originalUrl,
          msResponseTime: Date.now() - startTime,
          userAgent: request.get('user-agent') ?? '',
          stack: exception instanceof Error ? exception.stack : undefined,
        };

        if (statusCode >= 500) {
          this.logger.error(details);
        } else {
          this.logger.warn(details);
        }

        return throwError(() => exception);
      }),
    );
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof EntityNotFoundError) {
      return HttpStatus.NOT_FOUND;
    }

    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
