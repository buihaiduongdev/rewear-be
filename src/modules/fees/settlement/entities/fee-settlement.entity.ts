import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import {
  FeeAssessment,
  FeeCollection,
} from '@/modules/fees/entities/fee.entity';
import type { PayoutSource } from '@/modules/shop-finance/payouts/types/payout.type';
import { User } from '@/modules/user/entities';

@Entity('fee_wallet_debits')
@Index(['buyerId', 'requestId'], { unique: true })
@Check('CHK_fee_wallet_debit_positive', 'amount > 0')
@Check('CHK_fee_wallet_mode', `mode IN ('EVIDENCE','SIMULATION')`)
export class FeeWalletDebit extends BaseEntity {
  @Column('uuid')
  feeId: string;
  @ManyToOne(() => FeeAssessment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feeId' })
  fee: FeeAssessment;
  @Column('uuid')
  buyerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;
  @Column('uuid')
  requestId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column('integer')
  amount: number;
}

@Entity('fee_offset_allocations')
@Index(['collectionId', 'kind', 'sourceId'], { unique: true })
@Check('CHK_fee_offset_positive', 'amount > 0')
export class FeeOffsetAllocation extends BaseEntity {
  @Column('uuid')
  collectionId: string;
  @ManyToOne(() => FeeCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collectionId' })
  collection: FeeCollection;
  @Column({ type: 'varchar', length: 20 })
  kind: PayoutSource['kind'];
  @Column('uuid')
  sourceId: string;
  @Column('uuid')
  orderId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column('integer')
  amount: number;
}

@Entity('fee_settlement_incidents')
@Index(['kind', 'recordId'], { unique: true })
export class FeeSettlementIncident extends BaseEntity {
  @Column('varchar')
  kind: string;
  @Column('varchar')
  recordId: string;
  @Column({ type: 'integer', default: 1 })
  attempts: number;
  @Column('timestamptz')
  lastAttemptAt: Date;
  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
