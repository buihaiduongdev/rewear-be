import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { CoinGrant, CoinMovement, CoinRecovery } from '../core/entities';
import { CoinProgramService } from './coin-program.service';
import { CoinProgram, CoinProgramAudit } from './entities';
import type {
  CoinProgramRecipient,
  CreateCoinProgram,
} from './schemas/coin-program.schema';

@Injectable()
export class CoinProgramApiService {
  constructor(
    private readonly db: DataSource,
    private readonly programs: CoinProgramService,
  ) {}

  private async admin(manager: EntityManager, id: string) {
    if (
      !(await manager.existsBy(User, {
        id,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      }))
    )
      throw new ForbiddenException('Active Admin required');
  }

  private async mutate<T>(
    actorId: string,
    action: (manager: EntityManager, now: Date) => Promise<T>,
  ) {
    return this.db.transaction(async (manager) => {
      await this.admin(manager, actorId);
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      return action(manager, new Date(now));
    });
  }

  create(actorId: string, input: CreateCoinProgram) {
    return this.mutate(actorId, (manager, now) =>
      this.programs.createProgram(manager, input, actorId, now),
    );
  }

  activate(actorId: string, id: string, reason: string) {
    return this.mutate(actorId, (manager, now) =>
      this.programs.activateProgram(manager, id, actorId, reason, now),
    );
  }

  stop(actorId: string, id: string, reason: string) {
    return this.mutate(actorId, (manager) =>
      this.programs.stopProgram(manager, id, actorId, reason),
    );
  }

  budget(actorId: string, id: string, budget: number, reason: string) {
    return this.mutate(actorId, (manager) =>
      this.programs.updateBudget(manager, id, budget, actorId, reason),
    );
  }

  issue(
    actorId: string,
    id: string,
    requestId: string,
    recipients: CoinProgramRecipient[],
    reason: string,
  ) {
    return this.mutate(actorId, async (manager, now) => {
      for (const recipient of recipients) {
        if (!(await manager.existsBy(User, { id: recipient.buyerId })))
          throw new BadRequestException('Unknown coin recipient');
      }
      return this.programs.issueProgramCoins(
        manager,
        id,
        requestId,
        recipients,
        actorId,
        reason,
        now,
      );
    });
  }

  correct(actorId: string, grantId: string, amount: number, evidence: string) {
    return this.mutate(actorId, (manager) =>
      this.programs.recoverProgramMistake(
        manager,
        grantId,
        amount,
        actorId,
        evidence,
      ),
    );
  }

  async list(actorId: string) {
    await this.admin(this.db.manager, actorId);
    return this.db.manager.find(CoinProgram, {
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async history(actorId: string, id: string) {
    await this.admin(this.db.manager, actorId);
    return this.db.manager.find(CoinProgramAudit, {
      where: { programId: id },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async report(actorId: string, id: string) {
    const manager = this.db.manager;
    await this.admin(manager, actorId);
    const program = await manager.findOneByOrFail(CoinProgram, { id });
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    const roots = await manager.findBy(CoinGrant, {
      source: 'PROGRAM',
      sourceId: id,
    });
    const rootIds = roots.map((lot) => lot.id);
    const descendants = rootIds.length
      ? await manager
          .createQueryBuilder(CoinGrant, 'grant')
          .where('grant.rootGrantId IN (:...ids)', { ids: rootIds })
          .getMany()
      : [];
    const lots = [...roots, ...descendants];
    return {
      program,
      issued: program.issued,
      spent: lots.reduce((sum, lot) => sum + lot.spent, 0),
      recovered: lots.reduce((sum, lot) => sum + lot.recovered, 0),
      held: lots.reduce((sum, lot) => sum + lot.held, 0),
      expired: lots.reduce(
        (sum, lot) =>
          sum +
          (lot.expiresAt && lot.expiresAt <= new Date(now)
            ? lot.amount -
              lot.spent -
              lot.recovered -
              lot.held -
              lot.transferred
            : 0),
        0,
      ),
    };
  }

  async balance(buyerId: string) {
    const [{ now }] = await this.db.query('SELECT clock_timestamp() AS now');
    const lots = await this.db.manager.findBy(CoinGrant, { buyerId });
    return ['EVIDENCE', 'SIMULATION'].map((mode) => {
      const qualified = lots.filter((lot) => lot.mode === mode);
      return {
        mode,
        available: qualified.reduce(
          (sum, lot) =>
            sum +
            (lot.expiresAt && lot.expiresAt <= new Date(now)
              ? 0
              : lot.amount -
                lot.held -
                lot.spent -
                lot.recovered -
                (lot.transferred ?? 0)),
          0,
        ),
        held: qualified.reduce((sum, lot) => sum + lot.held, 0),
      };
    });
  }

  async buyerHistory(buyerId: string) {
    const grants = await this.db.manager.find(CoinGrant, {
      where: { buyerId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const movements = grants.length
      ? await this.db.manager
          .createQueryBuilder(CoinMovement, 'movement')
          .where('movement.grantId IN (:...ids)', {
            ids: grants.map((grant) => grant.id),
          })
          .orderBy('movement.createdAt', 'DESC')
          .take(200)
          .getMany()
      : [];
    const recoveries = await this.db.manager.findBy(CoinRecovery, { buyerId });
    return {
      grants,
      movements,
      pendingRecovery: recoveries.map((row) => ({
        mode: row.mode,
        amount: row.target - row.collected,
        grantId: row.grantId,
      })),
    };
  }
}
