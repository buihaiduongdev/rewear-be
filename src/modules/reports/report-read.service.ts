import { Injectable } from '@nestjs/common';

import { DataSource, type EntityManager } from 'typeorm';

import { Product, ProductModeration } from '@/modules/product/entities';
import { Shop } from '@/modules/shop/entities';

import { REPORT_TARGET } from './constants/report.constant';
import {
  ReportAudit,
  ReportEvidence,
  ViolationReport,
} from './entities/report.entity';
import { ReportAccess } from './report.access';
import type { ReportQuery } from './types/report.type';

@Injectable()
export class ReportReadService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ReportAccess,
  ) {}
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
  async view(manager: EntityManager, row: ViolationReport, admin = false) {
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
  mineDetail(userId: string, id: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) =>
      this.view(manager, await this.access.own(manager, userId, id)),
    );
  }
  adminDetail(userId: string, id: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) =>
      this.view(
        manager,
        await this.access.adminReport(manager, userId, id),
        true,
      ),
    );
  }
  list(userId: string, input: ReportQuery, admin = false) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      if (admin) await this.access.admin(manager, userId);
      else await this.access.active(manager, userId);
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
    });
  }
}
