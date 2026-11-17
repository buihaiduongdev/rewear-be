import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { ACCESS_POLICY } from '@/modules/authorization/constants/access-policy.constant';
import type { ShopPermissionPolicy } from '@/modules/authorization/types/access-policy.type';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const policy = this.reflector.getAllAndOverride<ShopPermissionPolicy>(
      ACCESS_POLICY,
      [context.getHandler(), context.getClass()],
    );
    if (policy?.type === 'public') return true;
    return super.canActivate(context);
  }
}
