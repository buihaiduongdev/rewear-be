import { BadRequestException, Injectable } from '@nestjs/common';

import { AuthProvider } from '../enums';
import type { AuthStrategy } from '../interfaces/auth-strategy.interface';
import type { OAuthLoginInput } from '../schemas/auth-input.schema';
import { GoogleAuthStrategy } from './google.strategy';

@Injectable()
export class OAuthStrategyFactory {
  constructor(private readonly googleStrategy: GoogleAuthStrategy) {}

  getStrategy(
    provider: OAuthLoginInput['provider'],
  ): AuthStrategy<OAuthLoginInput> {
    switch (provider) {
      case AuthProvider.GOOGLE:
        return this.googleStrategy;
      default:
        throw new BadRequestException(
          `Provider ${provider as string} is not supported`,
        );
    }
  }
}
