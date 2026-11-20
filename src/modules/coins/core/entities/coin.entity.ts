import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import type {
  CoinAllocation,
  CoinReservationState,
  CoinSource,
} from '../types/coin.type';

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
@Entity('coin_reservations')
@Check('CHK_coin_reservation_positive', '"amount" > 0')
@Index(['checkoutId', 'state'])
@Index(['orderId', 'state'])
export class CoinReservation extends BaseEntity {
  @Column('uuid')
  checkoutId: string;
  @Column('uuid', { nullable: true })
  orderId: string | null;
  @Column('uuid')
  grantId: string;
  @Column('integer')
  amount: number;
  @Column('varchar')
  state: CoinReservationState;
  @Column('timestamptz', { nullable: true })
  expiresAt: Date | null;
}
@Entity('coin_order_debits')
@Check('CHK_coin_order_debit_positive', '"amount" > 0')
@Index(['orderId'], { unique: true })
export class CoinOrderDebit extends BaseEntity {
  @Column('uuid')
  orderId: string;
  @Column('uuid')
  buyerId: string;
  @Column('varchar')
  mode: ReconciliationMode;
  @Column('integer')
  amount: number;
  @Column('jsonb')
  allocations: CoinAllocation[];
}
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
@Entity('coin_movements')
export class CoinMovement extends BaseEntity {
  @Column('uuid')
  grantId: string;
  @Column('varchar')
  kind: string;
  @Column('integer')
  amount: number;
  @Column('uuid', { nullable: true })
  referenceId: string | null;
}
