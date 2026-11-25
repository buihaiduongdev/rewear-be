import { Injectable, NotFoundException } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';

import { ChatAccess } from '../chat.access';
import { ChatMessageMedia } from '../entities/chat-message-media.entity';
import { ChatMessage } from '../entities/chat.entity';

@Injectable()
export class ChatMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ChatAccess,
    private readonly storage: StorageService,
  ) {}

  async download(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const link = await manager.findOne(ChatMessageMedia, {
        where: { mediaId: id },
        relations: { media: true },
      });
      if (!link || link.media.visibility !== 'private' || link.media.retiredAt)
        throw new NotFoundException('Attached chat media not found');
      const message = await manager.findOneByOrFail(ChatMessage, {
        id: link.messageId,
      });
      await this.access.load(manager, userId, message.conversationId);
      return this.storage.createDownloadUrl(link.media.storageKey);
    });
  }
}
