import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

@Entity('coin_recoveries')
@Index(['grantId'], { unique: true })
export class CoinRecovery extends BaseEntity {
  @Column('uuid')
  grantId: string;
  @Column('uuid')
  buyerId: string;
  @Column('varchar')
  mode: ReconciliationMode;
  @Column('integer')
  target: number;
  @Column('integer', { default: 0 })
  collected: number;
}
