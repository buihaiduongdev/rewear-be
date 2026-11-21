import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, MoreThan } from 'typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';

import { ChatAccess } from '../chat.access';
import { CHAT_POLICY } from '../constants/chat.constant';
import { ChatMedia, ChatMessage } from '../entities/chat.entity';
import { chatUploadSchema } from '../schemas/chat.schema';

@Injectable()
export class ChatMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ChatAccess,
    private readonly storage: PrivateEvidenceStorage,
  ) {}
  async createUpload(
    userId: string,
    conversationId: string,
    input: { mimeType: string; sizeBytes: number },
  ) {
    const data = chatUploadSchema.parse(input);
    this.storage.assertConfigured();
    const row = await this.db.transaction(async (manager) => {
      await this.access.load(manager, userId, conversationId, true);
      const [{ now: timestamp }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(timestamp);
      const uploads = await manager.countBy(ChatMedia, {
        conversationId,
        uploadedById: userId,
        createdAt: MoreThan(new Date(now.getTime() - CHAT_POLICY.DAY_MS)),
      });
      if (uploads >= CHAT_POLICY.UPLOADS_PER_ACTOR_CONVERSATION_DAY)
        throw new BadRequestException('Chat upload limit reached');
      const id = randomUUID();
      return manager.save(
        ChatMedia,
        manager.create(ChatMedia, {
          id,
          conversationId,
          uploadedById: userId,
          messageId: null,
          storageKey: `chat-media/${conversationId}/${userId}/${id}`,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
          ready: false,
          eTag: null,
          uploadExpiresAt: new Date(now.getTime() + CHAT_POLICY.UPLOAD_TTL_MS),
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
  private async find(id: string) {
    const row = await this.db.manager.findOneBy(ChatMedia, { id });
    if (!row) throw new NotFoundException('Chat media not found');
    return row;
  }
  async complete(userId: string, id: string) {
    const original = await this.find(id);
    await this.access.load(this.db.manager, userId, original.conversationId);
    if (original.uploadedById !== userId)
      throw new ForbiddenException('Chat upload belongs to another sender');
    const metadata = await this.storage.getObjectMetadata(original.storageKey);
    return this.db.transaction(async (manager) => {
      await this.access.load(manager, userId, original.conversationId, true);
      const row = await manager.findOneByOrFail(ChatMedia, {
        id,
        uploadedById: userId,
      });
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const invalidMetadata =
        !metadata.eTag ||
        metadata.eTag.length > 255 ||
        metadata.contentType !== row.mimeType ||
        metadata.sizeBytes !== row.sizeBytes ||
        (row.ready && row.eTag !== metadata.eTag);
      if (invalidMetadata)
        throw new BadRequestException(
          'Chat object metadata does not match immutable upload',
        );
      if (!row.ready && row.uploadExpiresAt <= new Date(now))
        throw new BadRequestException('Chat upload ticket expired');
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
  async download(userId: string, id: string) {
    const original = await this.find(id);
    return this.db.transaction(async (manager) => {
      await this.access.load(manager, userId, original.conversationId);
      const row = await manager.findOneByOrFail(ChatMedia, { id });
      const message = row.messageId
        ? await manager.findOneBy(ChatMessage, {
            id: row.messageId,
            conversationId: row.conversationId,
          })
        : null;
      if (!row.ready || !row.eTag || !message?.mediaIds.includes(id))
        throw new NotFoundException('Attached chat media not found');
      return this.storage.createDownloadUrl(row.storageKey, row.eTag);
    });
  }
}
