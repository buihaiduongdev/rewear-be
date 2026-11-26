import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import type { NotificationScope } from '../schemas/notification.schema';

@Entity('notifications')
@Index(['eventKey', 'recipientId'], { unique: true })
@Index(['recipientId', 'createdAt', 'id'])
export class Notification extends BaseEntity {
  @Column('varchar', { length: 32, default: 'INBOX' })
  targetType: string;
  @Column('varchar', { length: 512 })
  eventKey: string;
  @Column('uuid')
  recipientId: string;
  @Column('varchar', { length: 32 })
  kind: string;
  @Column('uuid')
  sourceId: string;
  @Column('varchar', { length: 16 })
  scope: NotificationScope;
  @Column('uuid', { nullable: true })
  shopId: string | null;
  @Column('varchar', { nullable: true })
  permission: string | null;
  @Column('varchar', { length: 200 })
  title: string;
  @Column('text')
  body: string;
  @Column('varchar', { length: 16, nullable: true })
  mode: ReconciliationMode | null;
  @Column('timestamptz', { nullable: true })
  readAt: Date | null;
}
