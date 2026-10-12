import { BadRequestException, Injectable } from '@nestjs/common';

import { AuthProvider } from '../enums';
import type { AuthStrategy } from '../interfaces/auth-strategy.interface';
import { CredentialAuthStrategy } from './credential.strategy';
import { GoogleAuthStrategy } from './google.strategy';

@Injectable()
export class AuthStrategyFactory {
  constructor(
    private readonly credentialStrategy: CredentialAuthStrategy,
    private readonly googleStrategy: GoogleAuthStrategy,
  ) {}

  getStrategy(provider: AuthProvider): AuthStrategy {
    switch (provider) {
      case AuthProvider.CREDENTIALS:
        return this.credentialStrategy;
      case AuthProvider.GOOGLE:
        return this.googleStrategy;
      default:
        throw new BadRequestException(
          `Provider ${provider as string} is not supported`,
        );
    }
  }
}
