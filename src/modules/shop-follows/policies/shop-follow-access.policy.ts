import { ForbiddenException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

export async function assertFollowUser(manager: EntityManager, userId: string) {
  if (
    !(await manager.existsBy(User, { id: userId, status: UserStatus.ACTIVE }))
  )
    throw new ForbiddenException('Active account required');
}
