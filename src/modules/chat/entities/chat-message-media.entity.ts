import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';

import { ChatMessage } from './chat-message.entity';

@Entity('chat_message_media')
@Index(['messageId', 'mediaId'], { unique: true })
export class ChatMessageMedia extends BaseEntity {
  @Column('uuid')
  messageId: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: ChatMessage;

  @Column('uuid')
  mediaId: string;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mediaId' })
  media: Media;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;
}
