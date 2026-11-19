import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';

import {
  DISPUTE_EVIDENCE_STATE,
  DISPUTE_POLICY,
} from './constants/dispute.constant';
import { DisputeAccess } from './dispute.access';
import { DisputeAppealEvidence } from './entities/dispute-appeal.entity';
import {
  DisputeAttachment,
  DisputeEvidence,
  DisputeMessage,
} from './entities/dispute.entity';
import { disputeUploadSchema } from './schemas/dispute.schema';
import type { DisputeUploadInput } from './types/dispute.type';

@Injectable()
export class DisputeEvidenceService {
  constructor(
    private readonly db: DataSource,
    private readonly access: DisputeAccess,
    private readonly storage: PrivateEvidenceStorage,
  ) {}
  private async clock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [row] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(row.now);
  }
  private async find(manager: EntityManager, id: string) {
    const row = await manager.getRepository(DisputeEvidence).findOneBy({ id });
    if (!row) throw new NotFoundException('Evidence not found');
    return row;
  }
  private metadata(row: DisputeEvidence) {
    return {
      id: row.id,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      tags: row.tags,
      status: row.status,
      readyAt: row.readyAt,
    };
  }
  async createUpload(
    userId: string,
    orderId: string,
    input: DisputeUploadInput,
  ) {
    const validatedInput = disputeUploadSchema.safeParse(input);
    if (!validatedInput.success)
      throw new BadRequestException('Invalid evidence upload');
    this.storage.assertConfigured();
    const row = await this.db.transaction(async (manager) => {
      const now = await this.clock(manager);
      await this.access.assertUploadAllowed(manager, userId, orderId, now);
      const repo = manager.getRepository(DisputeEvidence);
      // Lifetime count also caps abandoned tickets; it cannot be bypassed with expiry.
      if (
        (await repo.countBy({ orderId, uploadedById: userId })) >=
        DISPUTE_POLICY.MAX_EVIDENCE_PER_ORDER_USER
      )
        throw new BadRequestException('Evidence limit reached');
      const id = randomUUID();
      return repo.save(
        repo.create({
          id,
          orderId,
          uploadedById: userId,
          storageKey: `dispute-evidence/${orderId}/${id}`,
          mimeType: validatedInput.data.mimeType,
          sizeBytes: validatedInput.data.sizeBytes,
          tags: validatedInput.data.tags,
          status: DISPUTE_EVIDENCE_STATE.UPLOADING,
          uploadExpiresAt: new Date(
            now.getTime() + DISPUTE_POLICY.UPLOAD_EXPIRES_SECONDS * 1000,
          ),
          eTag: null,
          readyAt: null,
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
  async confirm(userId: string, evidenceId: string) {
    const original = await this.find(this.db.manager, evidenceId);
    if (original.uploadedById !== userId)
      throw new ForbiddenException('Evidence belongs to another uploader');
    await this.access.assertParty(this.db.manager, userId, original.orderId);
    if (original.status === DISPUTE_EVIDENCE_STATE.READY)
      return this.metadata(original);
    const metadata = await this.storage.getObjectMetadata(original.storageKey);
    return this.db.transaction(async (manager) => {
      const now = await this.clock(manager);
      const row = await this.find(manager, evidenceId);
      if (row.uploadedById !== userId)
        throw new ForbiddenException('Evidence belongs to another uploader');
      await this.access.assertParty(manager, userId, row.orderId);
      if (row.status === DISPUTE_EVIDENCE_STATE.READY)
        return this.metadata(row);
      await this.access.assertUploadAllowed(manager, userId, row.orderId, now);
      if (now >= row.uploadExpiresAt)
        throw new BadRequestException('Upload ticket expired');
      const metadataDoesNotMatchTicket =
        !metadata.eTag ||
        metadata.eTag.length > 255 ||
        metadata.contentType !== row.mimeType ||
        metadata.sizeBytes !== row.sizeBytes;
      if (metadataDoesNotMatchTicket)
        throw new BadRequestException(
          'Uploaded evidence metadata does not match ticket',
        );
      row.status = DISPUTE_EVIDENCE_STATE.READY;
      row.eTag = metadata.eTag!;
      row.readyAt = now;
      await manager.getRepository(DisputeEvidence).save(row);
      return this.metadata(row);
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
      if (!attachment && !message && !appealAttachment)
        throw new ForbiddenException('Evidence has not been submitted');
    }
    return this.signedDownload(row);
  }
  async adminDownload(evidenceId: string) {
    return this.signedDownload(await this.find(this.db.manager, evidenceId));
  }
  private signedDownload(row: DisputeEvidence) {
    if (row.status !== DISPUTE_EVIDENCE_STATE.READY || !row.eTag)
      throw new BadRequestException('Evidence is not ready');
    return this.storage.createDownloadUrl(row.storageKey, row.eTag);
  }
}
