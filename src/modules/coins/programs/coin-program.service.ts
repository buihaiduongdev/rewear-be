import { createHash } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import {
  COIN_POLICY,
  COIN_PROGRAM_STATUS,
  COIN_SOURCE,
} from '../core/constants/coin.constant';
import { CoinGrant, CoinMovement } from '../core/entities';
import {
  CoinProgram,
  CoinProgramAudit,
  CoinProgramBatch,
  CoinProgramMistake,
} from './entities';
import type {
  CoinProgramRecipient,
  CreateCoinProgram,
} from './schemas/coin-program.schema';

@Injectable()
export class CoinProgramService {
  private async lock(manager: EntityManager) {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Coin mutations require caller transaction');
  }

  private async audit(
    manager: EntityManager,
    programId: string,
    actorId: string,
    action: string,
    reason: string,
    details: Record<string, unknown>,
  ) {
    if (!reason.trim()) throw new BadRequestException('A reason is required');
    await manager.save(
      CoinProgramAudit,
      manager.create(CoinProgramAudit, {
        programId,
        actorId,
        action,
        reason,
        details,
      }),
    );
  }

  async createProgram(
    manager: EntityManager,
    input: CreateCoinProgram,
    actorId: string,
    now: Date,
  ) {
    await this.lock(manager);
    if (
      !input.name.trim() ||
      !input.reason.trim() ||
      !input.audience.trim() ||
      !Number.isSafeInteger(input.budget) ||
      input.budget < 0 ||
      input.budget > COIN_POLICY.MAX_POSTGRES_AMOUNT ||
      (input.expiresAt && input.expiresAt <= now)
    )
      throw new BadRequestException('Invalid coin program');
    const program = await manager.save(
      CoinProgram,
      manager.create(CoinProgram, {
        ...input,
        createdBy: actorId,
        issued: 0,
        status: COIN_PROGRAM_STATUS.DRAFT,
      }),
    );
    await this.audit(manager, program.id, actorId, 'CREATE', input.reason, {
      budget: input.budget,
      expiresAt: input.expiresAt,
    });
    return program;
  }

  async activateProgram(
    manager: EntityManager,
    programId: string,
    actorId: string,
    reason: string,
    now: Date,
  ) {
    await this.lock(manager);
    const program = await manager.findOneByOrFail(CoinProgram, {
      id: programId,
    });
    if (
      program.status !== COIN_PROGRAM_STATUS.DRAFT ||
      (program.expiresAt && program.expiresAt <= now)
    )
      throw new BadRequestException('Program cannot be activated');
    program.status = COIN_PROGRAM_STATUS.ACTIVE;
    await this.audit(manager, programId, actorId, 'ACTIVATE', reason, {});
    return manager.save(program);
  }

  async stopProgram(
    manager: EntityManager,
    programId: string,
    actorId: string,
    reason: string,
  ) {
    await this.lock(manager);
    const program = await manager.findOneByOrFail(CoinProgram, {
      id: programId,
    });
    program.status = COIN_PROGRAM_STATUS.STOPPED;
    await this.audit(manager, programId, actorId, 'STOP', reason, {});
    return manager.save(program);
  }

  async updateBudget(
    manager: EntityManager,
    programId: string,
    budget: number,
    actorId: string,
    reason: string,
  ) {
    await this.lock(manager);
    const program = await manager.findOneByOrFail(CoinProgram, {
      id: programId,
    });
    if (
      !Number.isSafeInteger(budget) ||
      budget < program.issued ||
      budget > COIN_POLICY.MAX_POSTGRES_AMOUNT
    )
      throw new BadRequestException(
        'Budget cannot be lower than cumulative issued coins',
      );
    const previous = program.budget;
    program.budget = budget;
    await this.audit(manager, programId, actorId, 'BUDGET', reason, {
      previous,
      budget,
    });
    return manager.save(program);
  }

  async issueProgramCoins(
    manager: EntityManager,
    programId: string,
    requestId: string,
    recipients: CoinProgramRecipient[],
    actorId: string,
    reason: string,
    now: Date,
  ) {
    await this.lock(manager);
    const sorted = [...recipients].sort((a, b) =>
      a.buyerId.localeCompare(b.buyerId),
    );
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(sorted))
      .digest('hex');
    const prior = await manager.findOneBy(CoinProgramBatch, {
      programId,
      requestId,
    });
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new BadRequestException('Program request payload changed');
      return prior;
    }
    const program = await manager.findOneByOrFail(CoinProgram, {
      id: programId,
    });
    if (
      program.status !== COIN_PROGRAM_STATUS.ACTIVE ||
      (program.expiresAt && program.expiresAt <= now)
    )
      throw new BadRequestException('Program is not active');
    if (
      !sorted.length ||
      new Set(sorted.map((row) => row.buyerId)).size !== sorted.length ||
      sorted.some(
        (row) =>
          !Number.isSafeInteger(row.amount) ||
          row.amount <= 0 ||
          row.amount > COIN_POLICY.MAX_POSTGRES_AMOUNT,
      )
    )
      throw new BadRequestException('Invalid recipients');
    const amount = sorted.reduce((sum, row) => sum + row.amount, 0);
    if (
      !Number.isSafeInteger(amount) ||
      amount > program.budget - program.issued
    )
      throw new BadRequestException({
        message: 'Program budget exceeded',
        remainingBudget: program.budget - program.issued,
      });
    for (const recipient of sorted) {
      if (
        await manager.existsBy(CoinGrant, {
          source: COIN_SOURCE.PROGRAM,
          sourceId: programId,
          buyerId: recipient.buyerId,
          mode: program.mode,
        })
      )
        throw new BadRequestException(
          'Recipient already received this program',
        );
    }
    const grantIds = await this.createRecipientGrants(manager, program, sorted);
    program.issued += amount;
    await manager.save(program);
    await this.audit(manager, programId, actorId, 'ISSUE', reason, {
      requestId,
      amount,
      grantIds,
    });
    return manager.save(
      CoinProgramBatch,
      manager.create(CoinProgramBatch, {
        programId,
        requestId,
        fingerprint,
        grantIds,
      }),
    );
  }

  private async createRecipientGrants(
    manager: EntityManager,
    program: CoinProgram,
    sorted: CoinProgramRecipient[],
  ) {
    const grantIds: string[] = [];
    for (const recipient of sorted) {
      const grant = await manager.save(
        CoinGrant,
        manager.create(CoinGrant, {
          buyerId: recipient.buyerId,
          mode: program.mode,
          source: COIN_SOURCE.PROGRAM,
          sourceId: program.id,
          rootGrantId: null,
          parentGrantId: null,
          amount: recipient.amount,
          held: 0,
          spent: 0,
          recovered: 0,
          recoveryTarget: 0,
          buyerRestored: false,
          expiresAt: program.expiresAt,
        }),
      );
      grantIds.push(grant.id);
      await manager.save(
        CoinMovement,
        manager.create(CoinMovement, {
          grantId: grant.id,
          kind: 'PROGRAM_GRANT',
          amount: recipient.amount,
          referenceId: program.id,
        }),
      );
    }
    return grantIds;
  }

  async recoverProgramMistake(
    manager: EntityManager,
    grantId: string,
    target: number,
    actorId: string,
    evidence: string,
  ) {
    await this.lock(manager);
    if (!evidence.trim() || !Number.isSafeInteger(target) || target <= 0)
      throw new BadRequestException(
        'Verified evidence and a positive amount are required',
      );
    const grant = await manager.findOneByOrFail(CoinGrant, { id: grantId });
    if (grant.source !== COIN_SOURCE.PROGRAM || target > grant.amount)
      throw new BadRequestException('Invalid promotion correction');
    let mistake = await manager.findOneBy(CoinProgramMistake, { grantId });
    if (mistake) {
      if (mistake.target !== target)
        throw new BadRequestException('Promotion correction already recorded');
      return mistake;
    }
    grant.recoveryTarget = target;
    await manager.save(grant);
    const [{ now: databaseNow }] = await manager.query(
      'SELECT clock_timestamp() AS now',
    );
    const lineage = await manager.find(CoinGrant, {
      where: [{ id: grantId }, { rootGrantId: grantId }],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    let take = 0;
    for (const lot of lineage) {
      if (lot.expiresAt && lot.expiresAt <= new Date(databaseNow)) continue;
      const available =
        lot.amount -
        lot.held -
        lot.spent -
        lot.recovered -
        (lot.transferred ?? 0);
      const collect = Math.min(target - take, available);
      if (collect <= 0) continue;
      lot.recovered += collect;
      take += collect;
      await manager.save(lot);
      await manager.save(
        CoinMovement,
        manager.create(CoinMovement, {
          grantId: lot.id,
          kind: 'RECOVER_PROMOTION',
          amount: collect,
          referenceId: grant.sourceId,
        }),
      );
    }
    const spent = lineage.reduce((sum, lot) => sum + lot.spent, 0);
    mistake = manager.create(CoinProgramMistake, {
      grantId,
      target,
      platformExpense: Math.min(target - take, spent),
      evidence,
      actorId,
    });
    await this.audit(manager, grant.sourceId, actorId, 'CORRECT', evidence, {
      grantId,
      target,
      recovered: take,
      platformExpense: mistake.platformExpense,
    });
    return manager.save(mistake);
  }
}
