import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, MoreThan } from 'typeorm';
import z from 'zod';

import { StorageService } from '@/infrastructure/storage';
import { MediaService } from '@/modules/media/media.service';
import { UserRole } from '@/modules/user/enums';

import {
  REPORT_MIME_TYPES,
  REPORT_POLICY,
  REPORT_STATUS,
} from '../constants/report.constant';
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
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}
  async attach(userId: string, input: z.input<typeof reportUploadSchema>) {
    const data = reportUploadSchema.parse(input);
    return this.db.transaction(async (manager) => {
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
      const file = await this.media.verifyMedia(
        manager,
        userId,
        data.mediaId,
        REPORT_POLICY.IMAGE_BYTES,
        'private',
      );
      if (!REPORT_MIME_TYPES.some((mimeType) => mimeType === file.mimeType))
        throw new BadRequestException('Unsupported report evidence type');
      const row = await manager.save(
        ReportEvidence,
        manager.create(ReportEvidence, {
          uploadedById: userId,
          targetType: data.targetType,
          targetId: data.targetId,
          target,
          reportId: null,
          mediaId: file.id,
        }),
      );
      return { id: row.id, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
    });
  }

  download(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const actor = await this.access.active(manager, userId);
      const row = await manager.findOneBy(ReportEvidence, { id });
      if (!row?.reportId || row.media.retiredAt)
        throw new NotFoundException('Attached report evidence not found');
      if (actor.role === UserRole.ADMIN)
        await this.access.adminReport(manager, userId, row.reportId);
      else await this.access.own(manager, userId, row.reportId);
      return this.storage.createDownloadUrl(row.media.storageKey);
    });
  }
}
