import { type EntityManager, In } from 'typeorm';

import { ChatMessageMedia } from './entities/chat-message-media.entity';
import type { ChatMessage } from './entities/chat.entity';

export async function chatMessageViews(
  manager: EntityManager,
  rows: ChatMessage[],
) {
  const links = rows.length
    ? await manager.find(ChatMessageMedia, {
        where: {
          messageId: In(rows.map((row) => row.id)),
        },
        relations: { media: true },
        order: { sortOrder: 'ASC' },
      })
    : [];
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    sequence: row.sequence,
    senderSide: row.senderSide,
    clientMessageId: row.clientMessageId,
    text: row.text,
    card: row.card,
    createdAt: row.createdAt,
    media: links
      .filter((link) => link.messageId === row.id)
      .map(({ media }) => ({
        id: media.id,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
      })),
  }));
}
