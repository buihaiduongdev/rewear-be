import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Request } from 'express';

import { ROLES_KEY } from '@/common/decorators';
import type { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: User }>();
    return Boolean(request.user && roles.includes(request.user.role));
  }
}
