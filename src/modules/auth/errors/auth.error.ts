import { UnauthorizedException } from '@nestjs/common';

import type { AuthErrorCode } from '../constants';

export const authError = (code: AuthErrorCode, message: string) =>
  new UnauthorizedException({ code, message });
