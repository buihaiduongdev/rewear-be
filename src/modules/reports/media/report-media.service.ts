import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, MoreThan } from 'typeorm';
import z from 'zod';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { UserRole } from '@/modules/user/enums';

import { REPORT_POLICY, REPORT_STATUS } from '../constants/report.constant';
import { ReportEvidence } from '../entities/report.entity';
import { reportTargetSnapshot } from '../policies/report-target.policy';
import { reportClock } from '../policies/report-transaction.policy';
import { ReportAccess } from '../report.access';
import { reportUploadSchema } from '../schemas/report.schema';

@Injectable()
export class ReportMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ReportAccess,
    private readonly storage: PrivateEvidenceStorage,
  ) {}
  async createUpload(
    userId: string,
    input: z.input<typeof reportUploadSchema>,
  ) {
    const data = reportUploadSchema.parse(input);
    this.storage.assertConfigured();
    const row = await this.db.transaction(async (manager) => {
      const now = await reportClock(manager);
      await this.access.active(manager, userId);
      const report = data.reportId
        ? await this.access.own(manager, userId, data.reportId)
        : null;
      if (
        report &&
        (report.targetType !== data.targetType ||
          report.targetId !== data.targetId)
      )
        throw new BadRequestException('Upload target does not match report');
      if (report?.status === REPORT_STATUS.RESOLVED)
        throw new ConflictException('Closed reports cannot receive evidence');
      const target =
        report?.target ??
        (await reportTargetSnapshot(
          manager,
          userId,
          data.targetType,
          data.targetId,
        ));
      const count = await manager.countBy(ReportEvidence, {
        uploadedById: userId,
        createdAt: MoreThan(new Date(now.getTime() - REPORT_POLICY.DAY_MS)),
      });
      if (count >= REPORT_POLICY.UPLOADS_PER_USER_DAY)
        throw new BadRequestException('Report upload limit reached');
      const id = randomUUID();
      return manager.save(
        ReportEvidence,
        manager.create(ReportEvidence, {
          id,
          uploadedById: userId,
          targetType: data.targetType,
          targetId: data.targetId,
          target,
          reportId: null,
          storageKey: `violation-report-evidence/${userId}/${id}`,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
          ready: false,
          eTag: null,
          uploadExpiresAt: new Date(
            now.getTime() + REPORT_POLICY.UPLOAD_TTL_MS,
          ),
        }),
      );
    });
    const ticket = await this.storage.createUploadTicket({
      key: row.storageKey,
      contentType: row.mimeType,
      sizeBytes: row.sizeBytes,
    });
    return { id: row.id, ...ticket, expiresAt: row.uploadExpiresAt };
  }
  async complete(userId: string, id: string) {
    await this.access.active(this.db.manager, userId);
    const original = await this.db.manager.findOneBy(ReportEvidence, {
      id,
      uploadedById: userId,
    });
    if (!original) throw new NotFoundException('Report upload not found');
    const metadata = await this.storage.getObjectMetadata(original.storageKey);
    return this.db.transaction(async (manager) => {
      const now = await reportClock(manager);
      await this.access.active(manager, userId);
      const row = await manager.findOneByOrFail(ReportEvidence, {
        id,
        uploadedById: userId,
      });
      const invalidMetadata =
        !metadata.eTag ||
        metadata.eTag.length > 255 ||
        metadata.contentType !== row.mimeType ||
        metadata.sizeBytes !== row.sizeBytes ||
        (row.ready && row.eTag !== metadata.eTag);
      if (invalidMetadata)
        throw new BadRequestException(
          'Report evidence metadata does not match immutable upload',
        );
      if (!row.ready && now >= row.uploadExpiresAt)
        throw new BadRequestException('Report upload ticket expired');
      row.ready = true;
      row.eTag = metadata.eTag!;
      await manager.save(row);
      return {
        id: row.id,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        ready: row.ready,
      };
    });
  }
  download(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const actor = await this.access.active(manager, userId);
      const row = await manager.findOneBy(ReportEvidence, { id });
      if (!row?.reportId || !row.ready || !row.eTag)
        throw new NotFoundException('Attached report evidence not found');
      if (actor.role === UserRole.ADMIN)
        await this.access.adminReport(manager, userId, row.reportId);
      else await this.access.own(manager, userId, row.reportId);
      return this.storage.createDownloadUrl(row.storageKey, row.eTag);
    });
  }
}
