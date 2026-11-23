import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { ViolationReport } from './entities/report.entity';

@Injectable()
export class ReportAccess {
  async active(manager: EntityManager, userId: string) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active account required');
    return user;
  }
  async admin(manager: EntityManager, userId: string) {
    const user = await this.active(manager, userId);
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Active Admin required');
    return user;
  }
  async own(manager: EntityManager, userId: string, id: string, lock = false) {
    await this.active(manager, userId);
    const row = await manager.findOne(ViolationReport, {
      where: { id, reporterId: userId },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }
  async adminReport(
    manager: EntityManager,
    userId: string,
    id: string,
    lock = false,
  ) {
    await this.admin(manager, userId);
    const row = await manager.findOne(ViolationReport, {
      where: { id },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }
}
