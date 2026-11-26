import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { MediaService } from '@/modules/media/media.service';
import { Order } from '@/modules/order/entities';

import { DISPUTE_POLICY } from './constants/dispute.constant';
import { DisputeAccess } from './dispute.access';
import { DisputeAppealEvidence } from './entities/dispute-appeal-evidence.entity';
import { DisputeAttachment } from './entities/dispute-attachment.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import { DisputeRemedyEvidenceLink } from './returns/entities/dispute-remedy-evidence-link.entity';
import { ReturnEvidenceLink } from './returns/entities/return-evidence-link.entity';
import {
  disputeFileSchema,
  disputeUploadSchema,
} from './schemas/dispute.schema';
import type { DisputeUploadInput } from './schemas/dispute.schema';

@Injectable()
export class DisputeEvidenceService {
  constructor(
    private readonly db: DataSource,
    private readonly access: DisputeAccess,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}
  private async clock(manager: EntityManager) {
    const [row] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(row.now);
  }
  private async find(manager: EntityManager, id: string) {
    const row = await manager.getRepository(DisputeEvidence).findOneBy({ id });
    if (!row) throw new NotFoundException('Evidence not found');
    return row;
  }
  async attach(userId: string, orderId: string, input: DisputeUploadInput) {
    const data = disputeUploadSchema.safeParse(input);
    if (!data.success) throw new BadRequestException('Invalid evidence');
    return this.db.transaction(async (manager) => {
      const now = await this.clock(manager);
      await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.access.assertUploadAllowed(manager, userId, orderId, now);
      const repo = manager.getRepository(DisputeEvidence);
      if (
        (await repo.countBy({ orderId, uploadedById: userId })) >=
        DISPUTE_POLICY.MAX_EVIDENCE_PER_ORDER_USER
      )
        throw new BadRequestException('Evidence limit reached');
      const file = await this.media.verifyMedia(
        manager,
        userId,
        data.data.mediaId,
        undefined,
        'private',
      );
      if (
        !disputeFileSchema.safeParse({
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        }).success
      )
        throw new BadRequestException('Invalid evidence file');
      const row = await repo.save(
        repo.create({
          orderId,
          uploadedById: userId,
          mediaId: file.id,
          tags: data.data.tags,
        }),
      );
      return {
        id: row.id,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        tags: row.tags,
      };
    });
  }
  async download(userId: string, evidenceId: string) {
    const manager = this.db.manager;
    const row = await this.find(manager, evidenceId);
    await this.access.assertParty(manager, userId, row.orderId);
    if (row.uploadedById !== userId) {
      const attachment = await manager
        .getRepository(DisputeAttachment)
        .countBy({ evidenceId });
      const message = attachment
        ? 0
        : await manager
            .getRepository(DisputeMessage)
            .createQueryBuilder('message')
            .where('message."evidenceIds" @> CAST(:ids AS jsonb)', {
              ids: JSON.stringify([evidenceId]),
            })
            .getCount();
      const appealAttachment =
        !attachment && !message
          ? await manager
              .getRepository(DisputeAppealEvidence)
              .countBy({ evidenceId })
          : 0;
      const returnProof = await this.db.manager
        .getRepository(ReturnEvidenceLink)
        .countBy({ evidenceId });
      const remedyProof = await this.db.manager
        .getRepository(DisputeRemedyEvidenceLink)
        .countBy({ evidenceId, orderId: row.orderId });
      if (
        !attachment &&
        !message &&
        !appealAttachment &&
        !returnProof &&
        !remedyProof
      )
        throw new ForbiddenException('Evidence has not been submitted');
    }
    return this.signedDownload(row);
  }
  async adminDownload(evidenceId: string) {
    return this.signedDownload(await this.find(this.db.manager, evidenceId));
  }
  private signedDownload(row: DisputeEvidence) {
    if (row.media.retiredAt) throw new NotFoundException('Evidence not found');
    return this.storage.createDownloadUrl(row.media.storageKey);
  }
}
