import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import type { EmailState, NotificationScope } from '../types/notification.type';

@Entity('notification_events')
@Index(['key'], { unique: true })
export class NotificationEvent extends BaseEntity {
  @Column('varchar', { length: 512 })
  key: string;
  @Column('varchar', { length: 64 })
  fingerprint: string;
}

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

@Entity('notification_email_jobs')
@Index(['notificationId'], { unique: true })
@Index(['state', 'nextAttemptAt'])
export class NotificationEmailJob extends BaseEntity {
  @Column('uuid')
  notificationId: string;
  @Column('varchar', { length: 16 })
  state: EmailState;
  @Column('integer', { default: 0 })
  attempts: number;
  @Column('timestamptz')
  nextAttemptAt: Date;
  @Column('uuid', { nullable: true })
  leaseToken: string | null;
  @Column('timestamptz', { nullable: true })
  leasedUntil: Date | null;
  @Column('timestamptz', { nullable: true })
  sentAt: Date | null;
}

@Entity('notification_checkpoints')
@Index(['name'], { unique: true })
export class NotificationCheckpoint extends BaseEntity {
  @Column('varchar')
  name: string;
}
