import type { DeepPartial } from 'typeorm';

import { ChatConversation } from '@/modules/chat/entities';

import { BaseFactory } from './base.factory';

export class ChatConversationFactory extends BaseFactory<ChatConversation> {
  definition(): DeepPartial<ChatConversation> {
    return {};
  }
}
