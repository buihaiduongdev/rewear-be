import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('notification_checkpoints')
@Index(['name'], { unique: true })
export class NotificationCheckpoint extends BaseEntity {
  @Column('varchar')
  name: string;
}
