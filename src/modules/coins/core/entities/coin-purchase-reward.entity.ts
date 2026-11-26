import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

@Entity('coin_purchase_rewards')
@Index(['orderId'], { unique: true })
@Check(
  'CHK_coin_purchase_reward_amounts',
  '"grantedAmount" >= 0 AND "entitlement" >= 0 AND "recoveredAmount" >= 0 AND "entitlement" <= "grantedAmount" AND "recoveredAmount" <= "grantedAmount" - "entitlement"',
)
export class CoinPurchaseReward extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @Column('uuid')
  buyerId: string;

  @Column('varchar')
  mode: ReconciliationMode;

  @Column('integer')
  grantedAmount: number;

  @Column('integer')
  entitlement: number;

  @Column('integer', { default: 0 })
  recoveredAmount: number;

  @Column('timestamptz')
  evaluatedAt: Date;
}
