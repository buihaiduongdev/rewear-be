import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { UserRole } from '@/modules/user/enums';

import { AuthorizationService } from '../authorization.service';
import { ACCESS_POLICY } from '../constants/access-policy.constant';
import type { ShopPermissionPolicy } from '../types/access-policy.type';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.getPolicy(context);
    if (policy.type === 'public') return true;

    const request = context.switchToHttp().getRequest<{
      user?: { id: string; role: UserRole };
      headers: Record<string, unknown>;
      params: Record<string, string>;
      body?: Record<string, unknown>;
    }>();
    if (!request.user) throw new ForbiddenException('Authentication required');
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length && !roles.includes(request.user.role))
      throw new ForbiddenException('Role access denied');
    if (policy.type === 'authenticated') return true;

    await this.authorize(request, policy);
    return true;
  }

  private getPolicy(context: ExecutionContext): ShopPermissionPolicy {
    const policy = this.reflector.getAllAndOverride<ShopPermissionPolicy>(
      ACCESS_POLICY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) throw new ForbiddenException('Access policy is required');
    return policy;
  }

  private async authorize(
    request: {
      user?: { id: string };
      headers: Record<string, unknown>;
      params: Record<string, string>;
      body?: Record<string, unknown>;
    },
    policy: Extract<ShopPermissionPolicy, { type: 'shop' }>,
  ): Promise<void> {
    const shopId = uuidSchema.safeParse(request.headers['x-shop-id']);
    if (!shopId.success)
      throw new BadRequestException('X-Shop-Id must be a UUID');
    for (const value of [request.params.shopId, request.body?.shopId]) {
      if (value === undefined) continue;
      const scopedId = uuidSchema.safeParse(value);
      if (!scopedId.success) throw new BadRequestException('Invalid shop ID');
      if (scopedId.data.toLowerCase() !== shopId.data.toLowerCase())
        throw new NotFoundException('Shop not found');
    }
    await this.authorizationService.authorize(
      request.user!.id,
      shopId.data,
      policy.permission,
    );
  }
}
