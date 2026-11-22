import type { DeepPartial } from 'typeorm';

import { ChatMessage } from '@/modules/chat/entities/chat.entity';

import { BaseFactory } from './base.factory';

export class ChatMessageFactory extends BaseFactory<ChatMessage> {
  definition(): DeepPartial<ChatMessage> {
    return {};
  }
}
