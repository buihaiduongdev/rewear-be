import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { EmailState } from '../schemas/notification.schema';

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
