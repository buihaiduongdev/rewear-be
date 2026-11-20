import { ForbiddenException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

export async function feeMoneyLock(manager: EntityManager) {
  await manager.query('SELECT pg_advisory_xact_lock(782143,1)');
  const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
  return new Date(now);
}

export async function assertFeeBuyer(manager: EntityManager, buyerId: string) {
  if (
    !(await manager.existsBy(User, { id: buyerId, status: UserStatus.ACTIVE }))
  )
    throw new ForbiddenException('Active fee payer required');
}

export async function assertFeeAdmin(manager: EntityManager, actorId: string) {
  if (
    !(await manager.existsBy(User, {
      id: actorId,
      status: UserStatus.ACTIVE,
      role: UserRole.ADMIN,
    }))
  )
    throw new ForbiddenException('Active fee Admin required');
}
