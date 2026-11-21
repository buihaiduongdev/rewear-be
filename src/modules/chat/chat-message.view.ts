import { type EntityManager, In } from 'typeorm';

import { ChatMedia, type ChatMessage } from './entities/chat.entity';

export async function chatMessageViews(
  manager: EntityManager,
  rows: ChatMessage[],
) {
  const ids = rows.flatMap((row) => row.mediaIds);
  const media = ids.length
    ? await manager.findBy(ChatMedia, { id: In(ids) })
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
    media: row.mediaIds.map((id) => {
      const item = media.find(
        (media) => media.id === id && media.messageId === row.id,
      );
      if (!item) throw new Error('Chat attachment requires reconciliation');
      return {
        id: item.id,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        ready: item.ready,
      };
    }),
  }));
}
