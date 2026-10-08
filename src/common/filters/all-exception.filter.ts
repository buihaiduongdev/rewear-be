import {
  ArgumentsHost,
  Catch,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import type { Response } from 'express';
import { EntityNotFoundError } from 'typeorm';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof EntityNotFoundError) {
      exception = new NotFoundException('Resource not found');
    }

    if (exception instanceof HttpException) {
      if (!response.locals.errorLogged) {
        const details = {
          statusCode: exception.getStatus(),
          message: exception.getResponse(),
          stack: exception.stack,
        };

        if (exception.getStatus() >= 500) {
          this.logger.error(details);
        } else {
          this.logger.warn(details);
        }
      }

      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const error = exception instanceof Error ? exception : undefined;

    if (!response.locals.errorLogged) {
      this.logger.error({
        message: error?.message ?? 'Unknown error',
        stack: error?.stack,
      });
    }

    const internalException = new InternalServerErrorException();
    response
      .status(internalException.getStatus())
      .json(internalException.getResponse());
  }
}
