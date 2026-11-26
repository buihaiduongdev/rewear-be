import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ShopApplicationSnapshot } from '../schemas/shop-application.schema';
import { ShopApplication } from './shop-application.entity';

@Entity('shop_application_revisions')
@Index(['applicationId', 'revision'], { unique: true })
export class ShopApplicationRevision extends BaseEntity {
  @Column('uuid')
  applicationId: string;
  @ManyToOne(() => ShopApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicationId' })
  application: ShopApplication;
  @Column('integer')
  revision: number;
  @Column('jsonb')
  snapshot: ShopApplicationSnapshot;
}
