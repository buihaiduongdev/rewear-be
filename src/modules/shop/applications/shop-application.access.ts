import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { ShopMember } from '../entities';
import { ShopMemberRole } from '../enums';
import { ShopApplication, ShopApplicationCommand } from './entities';
import { applicationFingerprint } from './policies/shop-application.policy';

export async function applicationClock(manager: EntityManager) {
  const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
  return new Date(now);
}
@Injectable()
export class ShopApplicationAccess {
  async active(manager: EntityManager, userId: string, admin = false) {
    const transactional = manager.queryRunner?.isTransactionActive;
    const actor = await manager.findOne(User, {
      where: { id: userId, status: UserStatus.ACTIVE },
      ...(transactional ? { lock: { mode: 'pessimistic_read' as const } } : {}),
    });
    if (!actor) throw new UnauthorizedException('Active account required');
    if (admin && actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('Active Admin required');
    return actor;
  }
  async owner(manager: EntityManager, userId: string, shopId: string) {
    await this.active(manager, userId);
    if (
      !(await manager.existsBy(ShopMember, {
        userId,
        shopId,
        memberRole: ShopMemberRole.OWNER,
      }))
    )
      throw new NotFoundException('Shop application not found');
  }
  async own(manager: EntityManager, userId: string, id: string) {
    await this.active(manager, userId);
    const row = await manager.findOneBy(ShopApplication, {
      id,
      applicantId: userId,
    });
    if (!row) throw new NotFoundException('Shop application not found');
    await this.owner(manager, userId, row.shopId);
    return row;
  }
  async admin(manager: EntityManager, userId: string, id: string) {
    await this.active(manager, userId, true);
    const row = await manager.findOneBy(ShopApplication, { id });
    if (!row) throw new NotFoundException('Shop application not found');
    return row;
  }
}
export async function applicationReplay(
  manager: EntityManager,
  actorId: string,
  requestId: string,
  payload: unknown,
) {
  const row = await manager.findOneBy(ShopApplicationCommand, {
    actorId,
    requestId,
  });
  if (row && row.fingerprint !== applicationFingerprint(payload))
    throw new ConflictException('Application request payload changed');
  return row;
}
export async function applicationCommand(
  manager: EntityManager,
  actorId: string,
  requestId: string,
  applicationId: string,
  payload: unknown,
) {
  await manager.save(
    ShopApplicationCommand,
    manager.create(ShopApplicationCommand, {
      actorId,
      requestId,
      applicationId,
      fingerprint: applicationFingerprint(payload),
    }),
  );
}
