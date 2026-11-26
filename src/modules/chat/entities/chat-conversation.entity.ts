import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities/base.entity';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

@Entity('chat_conversations')
@Index(['buyerId', 'shopId'], { unique: true })
@Index(['buyerId', 'lastMessageAt'])
@Index(['shopId', 'lastMessageAt'])
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

  @Column('timestamptz', { nullable: true })
  buyerLastReadAt: Date | null;

  @Column('timestamptz', { nullable: true })
  shopLastReadAt: Date | null;

  @Column('timestamptz', { nullable: true })
  lastMessageAt: Date | null;
}
