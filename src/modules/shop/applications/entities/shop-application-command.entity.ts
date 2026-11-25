import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { ShopApplication } from './shop-application.entity';

@Entity('shop_application_commands')
@Index(['actorId', 'requestId'], { unique: true })
export class ShopApplicationCommand extends BaseEntity {
  @Column('uuid')
  actorId: string;
  @Column('uuid')
  requestId: string;
  @Column('uuid')
  applicationId: string;
  @ManyToOne(() => ShopApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicationId' })
  application: ShopApplication;
  @Column('varchar', { length: 64 })
  fingerprint: string;
}
