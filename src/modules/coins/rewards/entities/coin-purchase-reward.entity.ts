import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

@Entity('coin_purchase_rewards')
@Index(['orderId'], { unique: true })
export class CoinPurchaseReward extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  grantId: string;

  @Column('varchar')
  mode: ReconciliationMode;

  @Column('integer')
  entitlement: number;

  @Column('timestamptz')
  evaluatedAt: Date;
}
