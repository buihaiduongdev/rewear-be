import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { AuthorizationService } from '@/modules/authorization/authorization.service';
import { PermissionGuard } from '@/modules/authorization/guards/permission.guard';

describe('PermissionGuard', () => {
  it('rejects a route without an access policy', async () => {
    const guard = new PermissionGuard(
      { getAllAndOverride: () => undefined } as unknown as Reflector,
      {} as AuthorizationService,
    );
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
