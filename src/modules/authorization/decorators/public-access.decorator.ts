import { SetMetadata } from '@nestjs/common';

import { ACCESS_POLICY } from '../constants/access-policy.constant';
import type { ShopPermissionPolicy } from '../types/access-policy.type';

export const PublicAccess = () =>
  SetMetadata(ACCESS_POLICY, {
    type: 'public',
  } satisfies ShopPermissionPolicy);
