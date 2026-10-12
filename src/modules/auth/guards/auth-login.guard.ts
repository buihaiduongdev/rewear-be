import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

import type { Request } from 'express';

import type { LoginDto } from '../dto';
import { AuthStrategyFactory } from '../strategies/auth-strategy';

@Injectable()
export class AuthLoginGuard implements CanActivate {
  constructor(private readonly strategyFactory: AuthStrategyFactory) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as LoginDto;

    if (!body?.provider) {
      throw new BadRequestException('Provider is required');
    }

    request.user = await this.strategyFactory
      .getStrategy(body.provider)
      .validate(body);
    return true;
  }
}
