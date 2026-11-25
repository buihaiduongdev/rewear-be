import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('notification_events')
@Index(['key'], { unique: true })
export class NotificationEvent extends BaseEntity {
  @Column('varchar', { length: 512 })
  key: string;
  @Column('varchar', { length: 64 })
  fingerprint: string;
}
