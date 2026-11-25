import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, type EntityManager } from 'typeorm';

import { notifyViolationReport } from '@/modules/notifications/sources/violation-report.notification';
import { Product, ProductModeration } from '@/modules/product/entities';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import {
  REPORT_ACTION,
  REPORT_STATUS,
  REPORT_TARGET,
} from './constants/report.constant';
import {
  ReportAudit,
  ReportCommand,
  ReportEvidence,
  ViolationReport,
} from './entities';
import {
  applyReportMeasure,
  attachReportEvidence,
  reportSubmissionTarget,
} from './report.policy';
import {
  type ClaimReportInput,
  claimReportSchema,
  type CreateReportInput,
  createReportSchema,
  type ReportAction,
  type ReportQuery,
  type ReportSupplementInput,
  reportSupplementSchema,
  type ResolveReportInput,
  resolveReportSchema,
} from './schemas/report.schema';

@Injectable()
export class ViolationReportService {
  constructor(private readonly db: DataSource) {}

  private fingerprint(input: unknown) {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  async clock(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  async assertActiveUser(manager: EntityManager, userId: string) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active account required');
    return user;
  }

  async assertAdmin(manager: EntityManager, userId: string) {
    const user = await this.assertActiveUser(manager, userId);
    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Active Admin required');
    return user;
  }

  async loadOwn(
    manager: EntityManager,
    userId: string,
    id: string,
    lock = false,
  ) {
    await this.assertActiveUser(manager, userId);
    const row = await manager.findOne(ViolationReport, {
      where: { id, reporterId: userId },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }

  async loadAdminReport(
    manager: EntityManager,
    userId: string,
    id: string,
    lock = false,
  ) {
    await this.assertAdmin(manager, userId);
    const row = await manager.findOne(ViolationReport, {
      where: { id },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }

  private async isReplay(
    manager: EntityManager,
    actorId: string,
    requestId: string,
    reportId: string,
    fingerprint: string,
  ) {
    const prior = await manager.findOneBy(ReportCommand, {
      actorId,
      requestId,
    });
    if (
      prior &&
      (prior.reportId !== reportId || prior.fingerprint !== fingerprint)
    )
      throw new ConflictException('Report command payload changed');
    return !!prior;
  }

  private async recordAction(
    manager: EntityManager,
    row: ViolationReport,
    actorId: string,
    action: ReportAction,
    publicReason: string | null = null,
    adminNote: string | null = null,
    effect: Record<string, unknown> | null = null,
  ) {
    await manager.save(
      ReportAudit,
      manager.create(ReportAudit, {
        reportId: row.id,
        actorId,
        action,
        version: row.version,
        status: row.status,
        publicReason,
        adminNote,
        effect,
      }),
    );
    await notifyViolationReport(manager, row, action);
  }

  create(userId: string, input: CreateReportInput) {
    const data = createReportSchema.parse(input);
    const fingerprint = this.fingerprint(data);
    return this.db.transaction(async (manager) => {
      await this.assertActiveUser(manager, userId);
      await manager.query(
        'SELECT pg_advisory_xact_lock(782143, hashtext($1))',
        [`${userId}:${data.requestId}`],
      );
      const existing = await manager.findOneBy(ViolationReport, {
        reporterId: userId,
        requestId: data.requestId,
      });
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ConflictException('Report request payload changed');
        return this.view(manager, existing);
      }
      const target = await reportSubmissionTarget(manager, userId, data);
      const row = await manager.save(
        ViolationReport,
        manager.create(ViolationReport, {
          reporterId: userId,
          requestId: data.requestId,
          fingerprint,
          targetType: data.targetType,
          targetId: data.targetId,
          target,
          reason: data.reason,
          description: data.description,
          status: REPORT_STATUS.OPEN,
          version: 1,
          assignedAdminId: null,
          outcome: null,
          measure: null,
          resolutionReason: null,
          adminNote: null,
          resolvedAt: null,
        }),
      );
      await attachReportEvidence(manager, row, data.evidenceIds);
      await this.recordAction(manager, row, userId, REPORT_ACTION.SUBMITTED);
      return this.view(manager, row);
    });
  }

  supplement(userId: string, id: string, input: ReportSupplementInput) {
    const data = reportSupplementSchema.parse(input);
    const fingerprint = this.fingerprint({
      id,
      action: REPORT_ACTION.SUPPLEMENTED,
      data,
    });
    return this.db.transaction(async (manager) => {
      const row = await this.loadOwn(manager, userId, id, true);
      if (await this.isReplay(manager, userId, data.requestId, id, fingerprint))
        return this.view(manager, row);
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException(
          'Closed reports cannot receive supplements',
        );
      await attachReportEvidence(manager, row, data.evidenceIds);
      row.version++;
      await manager.save(row);
      await manager.save(
        ReportCommand,
        manager.create(ReportCommand, {
          actorId: userId,
          requestId: data.requestId,
          reportId: id,
          fingerprint,
        }),
      );
      await this.recordAction(
        manager,
        row,
        userId,
        REPORT_ACTION.SUPPLEMENTED,
        data.text,
      );
      return this.view(manager, row);
    });
  }

  claim(actorId: string, id: string, input: ClaimReportInput) {
    const data = claimReportSchema.parse(input);
    const fingerprint = this.fingerprint({
      id,
      action: REPORT_ACTION.CLAIMED,
      data,
    });
    return this.db.transaction(async (manager) => {
      const row = await this.loadAdminReport(manager, actorId, id, true);
      if (
        await this.isReplay(manager, actorId, data.requestId, id, fingerprint)
      )
        return this.view(manager, row, true);
      if (row.version !== data.expectedVersion)
        throw new ConflictException('Report version changed');
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException('Report already resolved');
      if (
        row.status !== REPORT_STATUS.IN_REVIEW ||
        row.assignedAdminId !== actorId
      ) {
        row.status = REPORT_STATUS.IN_REVIEW;
        row.assignedAdminId = actorId;
        row.version++;
        await manager.save(row);
        await this.recordAction(manager, row, actorId, REPORT_ACTION.CLAIMED);
      }
      await manager.save(
        ReportCommand,
        manager.create(ReportCommand, {
          actorId,
          requestId: data.requestId,
          reportId: id,
          fingerprint,
        }),
      );
      return this.view(manager, row, true);
    });
  }

  resolve(actorId: string, id: string, input: ResolveReportInput) {
    const data = resolveReportSchema.parse(input);
    const fingerprint = this.fingerprint({
      id,
      action: REPORT_ACTION.RESOLVED,
      data,
    });
    return this.db.transaction(async (manager) => {
      const now = await this.clock(manager);
      const row = await this.loadAdminReport(manager, actorId, id, true);
      if (
        await this.isReplay(manager, actorId, data.requestId, id, fingerprint)
      )
        return this.view(manager, row, true);
      if (row.version !== data.expectedVersion)
        throw new ConflictException('Report version changed');
      if (row.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException('Report already resolved');
      const effect = await applyReportMeasure(manager, row, data);
      row.status = REPORT_STATUS.RESOLVED;
      row.version++;
      row.outcome = data.outcome;
      row.measure = data.action;
      row.resolutionReason = data.reason;
      row.adminNote = data.adminNote;
      row.resolvedAt = now;
      await manager.save(row);
      await manager.save(
        ReportCommand,
        manager.create(ReportCommand, {
          actorId,
          requestId: data.requestId,
          reportId: id,
          fingerprint,
        }),
      );
      await this.recordAction(
        manager,
        row,
        actorId,
        REPORT_ACTION.RESOLVED,
        data.reason,
        data.adminNote,
        effect,
      );
      return this.view(manager, row, true);
    });
  }

  async mineDetail(userId: string, id: string) {
    const row = await this.loadOwn(this.db.manager, userId, id);
    return this.view(this.db.manager, row);
  }

  async adminDetail(userId: string, id: string) {
    const row = await this.loadAdminReport(this.db.manager, userId, id);
    return this.view(this.db.manager, row, true);
  }

  async list(userId: string, input: ReportQuery, admin = false) {
    const manager = this.db.manager;
    if (admin) await this.assertAdmin(manager, userId);
    else await this.assertActiveUser(manager, userId);
    const query = manager.createQueryBuilder(ViolationReport, 'report');
    if (!admin) query.where('report.reporterId = :userId', { userId });
    if (input.status)
      query.andWhere('report.status = :status', { status: input.status });
    if (input.targetType)
      query.andWhere('report.targetType = :type', { type: input.targetType });
    const [rows, totalCount] = await query
      .orderBy('report.createdAt', 'DESC')
      .addOrderBy('report.id', 'DESC')
      .take(input.limit)
      .skip(input.offset)
      .getManyAndCount();
    const items = rows.map((row) =>
      admin
        ? {
            ...this.summary(row),
            reporterId: row.reporterId,
            assignedAdminId: row.assignedAdminId,
          }
        : this.summary(row),
    );
    return { items, totalCount, limit: input.limit, offset: input.offset };
  }

  private summary(row: ViolationReport) {
    return {
      id: row.id,
      targetType: row.targetType,
      target: row.target,
      reason: row.reason,
      description: row.description,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      resolution:
        row.outcome && row.measure && row.resolutionReason && row.resolvedAt
          ? {
              outcome: row.outcome,
              action: row.measure,
              reason: row.resolutionReason,
              resolvedAt: row.resolvedAt,
            }
          : null,
    };
  }

  private async view(
    manager: EntityManager,
    row: ViolationReport,
    admin = false,
  ) {
    const evidence = await manager.find(ReportEvidence, {
      where: { reportId: row.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const audits = await manager.find(ReportAudit, {
      where: { reportId: row.id },
      order: { version: 'ASC' },
    });
    const history = audits.map((item) => ({
      action: item.action,
      version: item.version,
      status: item.status,
      reason: item.publicReason,
      createdAt: item.createdAt,
    }));
    const result = {
      ...this.summary(row),
      evidence: evidence.map((item) => ({
        id: item.id,
        mimeType: item.media.mimeType,
        sizeBytes: item.media.sizeBytes,
      })),
      history,
    };
    if (!admin) return result;
    const target =
      row.targetType === REPORT_TARGET.PRODUCT
        ? await manager.findOneBy(Product, { id: row.targetId })
        : await manager.findOneBy(Shop, { id: row.targetId });
    const moderation =
      row.targetType === REPORT_TARGET.PRODUCT
        ? await manager.findOneBy(ProductModeration, {
            productId: row.targetId,
          })
        : null;
    return {
      ...result,
      reporterId: row.reporterId,
      assignedAdminId: row.assignedAdminId,
      adminNote: row.adminNote,
      audits: audits.map((item, index) => ({
        ...history[index],
        actorId: item.actorId,
        adminNote: item.adminNote,
        effect: item.effect,
      })),
      targetState: {
        exists: !!target,
        status: target?.status ?? null,
        moderationVersion: moderation?.version ?? null,
      },
    };
  }
}
