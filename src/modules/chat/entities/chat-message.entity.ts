import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/user/entities';

import { ChatConversation } from './chat-conversation.entity';

@Entity('chat_messages')
@Index(['conversationId', 'createdAt', 'id'])
export class ChatMessage extends BaseEntity {
  @Column('uuid')
  conversationId: string;

  @ManyToOne(() => ChatConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: ChatConversation;

  @Column('uuid')
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column('text', { nullable: true })
  text: string | null;
}
