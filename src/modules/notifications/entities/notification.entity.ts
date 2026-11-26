import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('notifications')
@Index('IDX_notifications_recipient_read_created', [
  'recipientId',
  'isRead',
  'createdAt',
])
export class Notification extends BaseEntity {
  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;
}
