import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { Request } from 'express';

import { createRequestValidationPipe } from '@/common/validation';

import { loginSchema } from '../schemas/auth-input.schema';
import { AuthStrategyFactory } from '../strategies/auth-strategy';

@Injectable()
export class AuthLoginGuard implements CanActivate {
  private readonly validationPipe = createRequestValidationPipe();

  constructor(private readonly strategyFactory: AuthStrategyFactory) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    // Guards run before global pipes, so validate before choosing a strategy.
    const body = await this.validationPipe.transform(request.body, {
      type: 'body',
      schema: loginSchema,
    });
    request.body = body;

    request.user = await this.strategyFactory
      .getStrategy(body.provider)
      .validate(body);
    return true;
  }
}
