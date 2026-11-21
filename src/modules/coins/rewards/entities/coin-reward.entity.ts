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

@Entity('coin_reward_adjustment_notices')
@Index(['grantId', 'entitlement'], { unique: true })
export class CoinRewardAdjustmentNotice extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  grantId: string;

  @Column('varchar')
  mode: ReconciliationMode;

  @Column('integer')
  previousEntitlement: number;

  @Column('integer')
  entitlement: number;

  @Column('integer')
  recovered: number;

  @Column('integer')
  pendingRecovery: number;

  @Column('jsonb')
  refundCreditIds: string[];

  @Column('text')
  reason: string;
}
