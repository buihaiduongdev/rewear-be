import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

@Entity('coin_selections')
@Index(['checkoutId', 'requestId'], { unique: true })
export class CoinSelection extends BaseEntity {
  @Column('boolean', { default: true })
  active: boolean;
  @Column('uuid')
  checkoutId: string;
  @Column('uuid')
  requestId: string;
  @Column('integer')
  amount: number;
  @Column('varchar')
  mode: ReconciliationMode;
}
