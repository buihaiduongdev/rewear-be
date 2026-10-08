import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';

import type { Request, Response } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, _response: Response, next: () => void): void {
    this.logger.log({
      requestId: request.headers['x-request-id'],
      method: request.method,
      originalUrl: request.originalUrl,
      ip: request.ip,
      userAgent: request.get('user-agent') ?? '',
    });
    next();
  }
}
