import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import type { ChatCardSnapshot, ChatSide } from '../types/chat.type';

@Entity('chat_conversations')
@Index(['buyerId', 'shopId'], { unique: true })
@Index(['shopId', 'lastMessageAt'])
@Check(
  'CHK_chat_conversation_cursors',
  '"lastSequence" >= 0 AND "buyerReadSequence" >= 0 AND "shopReadSequence" >= 0 AND "buyerReadSequence" <= "lastSequence" AND "shopReadSequence" <= "lastSequence"',
)
export class ChatConversation extends BaseEntity {
  @Column('uuid')
  buyerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;
  @Column('uuid')
  shopId: string;
  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;
  @Column('integer', { default: 0 })
  lastSequence: number;
  @Column('integer', { default: 0 })
  buyerReadSequence: number;
  @Column('integer', { default: 0 })
  shopReadSequence: number;
  @Column('timestamptz', { nullable: true })
  lastMessageAt: Date | null;
}

@Entity('chat_messages')
@Index(['conversationId', 'sequence'], { unique: true })
@Index(['conversationId', 'senderId', 'clientMessageId'], { unique: true })
@Check('CHK_chat_message_sequence', 'sequence > 0')
export class ChatMessage extends BaseEntity {
  @Column('uuid')
  conversationId: string;
  @ManyToOne(() => ChatConversation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conversationId' })
  conversation: ChatConversation;
  @Column('integer')
  sequence: number;
  @Column('uuid')
  senderId: string;
  @Column('varchar', { length: 16 })
  senderSide: ChatSide;
  @Column('uuid')
  clientMessageId: string;
  @Column('varchar', { length: 64 })
  fingerprint: string;
  @Column('text', { nullable: true })
  text: string | null;
  @Column('jsonb', { nullable: true })
  card: ChatCardSnapshot | null;
}
