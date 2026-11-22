import type { EntityManager } from 'typeorm';

import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import {
  NOTIFICATION_KIND,
  NOTIFICATION_TARGET,
} from '@/modules/notifications/constants/notification.constant';
import { publishNotification } from '@/modules/notifications/publish-notification';
import {
  personalRecipient,
  shopRecipients,
} from '@/modules/notifications/sources/notification-recipients';

import { CHAT_SIDE } from './constants/chat.constant';
import type { ChatConversation, ChatMessage } from './entities/chat.entity';

export async function notifyChatMessage(
  manager: EntityManager,
  conversation: ChatConversation,
  message: ChatMessage,
) {
  const recipients =
    message.senderSide === CHAT_SIDE.SHOP
      ? [personalRecipient(conversation.buyerId)]
      : await shopRecipients(
          manager,
          conversation.shopId,
          SHOP_PERMISSIONS.CHAT_MANAGE,
        );
  return publishNotification(manager, {
    key: `chat-message:${message.id}`,
    kind: NOTIFICATION_KIND.CHAT_MESSAGE,
    targetType: NOTIFICATION_TARGET.CHAT,
    sourceId: conversation.id,
    title: 'Tin nhắn mới',
    body: 'Bạn có tin nhắn mới trong hội thoại Buyer–Shop. Mở hội thoại để xem nội dung.',
    mode: null,
    occurredAt: message.createdAt,
    recipients: recipients.filter(
      (recipient) => recipient.userId !== message.senderId,
    ),
  });
}
