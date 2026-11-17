import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

import type { TShopPermission } from '../constants';
import { ACCESS_POLICY } from '../constants/access-policy.constant';
import type { ShopPermissionPolicy } from '../types/access-policy.type';

export const RequirePermission = (permission: TShopPermission) =>
  applyDecorators(
    SetMetadata(ACCESS_POLICY, {
      type: 'shop',
      permission,
    } satisfies ShopPermissionPolicy),
    ApiHeader({
      name: 'X-Shop-Id',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }),
  );
