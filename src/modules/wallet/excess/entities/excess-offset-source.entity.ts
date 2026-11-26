import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ExcessSource } from '../schemas/excess.schema';

@Entity('wallet_excess_offset_sources')
@Index(['sourceType', 'sourceId'], { unique: true })
export class ExcessOffsetSource extends BaseEntity {
  @Column('varchar', { length: 24 })
  sourceType: ExcessSource;

  @Column('uuid')
  sourceId: string;

  @Column('integer')
  amount: number;
}
