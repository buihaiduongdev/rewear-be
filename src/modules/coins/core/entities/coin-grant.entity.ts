import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import type { CoinSource } from '../types/coin.type';

@Entity('coin_grants')
@Index(['source', 'sourceId', 'buyerId'], { unique: true })
@Check(
  'CHK_coin_grant_counters',
  '"amount" >= 0 AND "held" >= 0 AND "spent" >= 0 AND "recovered" >= 0 AND "transferred" >= 0 AND "held" + "spent" + "recovered" + "transferred" <= "amount"',
)
export class CoinGrant extends BaseEntity {
  @Column('uuid')
  buyerId: string;
  @Column('varchar')
  mode: ReconciliationMode;
  @Column('varchar')
  source: CoinSource;
  @Column('uuid')
  sourceId: string;
  @Column('uuid', { nullable: true })
  rootGrantId: string | null;
  @Column('uuid', { nullable: true })
  parentGrantId: string | null;
  @Column('integer')
  amount: number;
  @Column('integer', { default: 0 })
  held: number;
  @Column('integer', { default: 0 })
  spent: number;
  @Column('integer', { default: 0 })
  recovered: number;
  @Column('integer', { default: 0 })
  transferred: number;
  @Column('integer', { default: 0 })
  recoveryTarget: number;
  @Column('boolean', { default: false })
  buyerRestored: boolean;
  @Column('timestamptz', { nullable: true })
  expiresAt: Date | null;
}
