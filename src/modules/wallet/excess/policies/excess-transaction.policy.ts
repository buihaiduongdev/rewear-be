import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { ExcessCommand, WalletExcess } from '../entities/excess.entity';

export async function excessClock(manager: EntityManager) {
  await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
  const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
  return new Date(now);
}
export async function excessActor(
  manager: EntityManager,
  id: string,
  admin = false,
) {
  const actor = await manager.findOneBy(User, {
    id,
    status: UserStatus.ACTIVE,
  });
  if (!actor) throw new UnauthorizedException();
  if (admin && actor.role !== UserRole.ADMIN) throw new ForbiddenException();
  return actor;
}
export async function excessAccess(
  manager: EntityManager,
  userId: string,
  id: string,
  admin = false,
) {
  await excessActor(manager, userId, admin);
  const row = await manager.findOneBy(
    WalletExcess,
    admin ? { id } : { id, buyerId: userId },
  );
  if (!row) throw new NotFoundException('Wallet recovery not found');
  return row;
}
export const excessFingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function excessReplay(
  manager: EntityManager,
  actorId: string,
  requestId: string,
  payload: unknown,
) {
  const row = await manager.findOneBy(ExcessCommand, { actorId, requestId });
  if (row && row.fingerprint !== excessFingerprint(payload))
    throw new ConflictException('Recovery command payload changed');
  return row;
}
export async function saveExcessCommand(
  manager: EntityManager,
  actorId: string,
  requestId: string,
  excessId: string,
  payload: unknown,
) {
  await manager.save(
    ExcessCommand,
    manager.create(ExcessCommand, {
      actorId,
      requestId,
      excessId,
      fingerprint: excessFingerprint(payload),
    }),
  );
}
