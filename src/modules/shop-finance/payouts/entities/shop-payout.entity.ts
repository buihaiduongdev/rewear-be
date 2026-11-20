import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import type {
  PayoutSource,
  PayoutStatus,
  RecipientSnapshot,
} from '../types/payout.type';

@Entity('shop_payouts')
@Index('UQ_shop_payout_active', ['shopId'], {
  unique: true,
  where: "status IN ('PENDING','PROCESSING','UNKNOWN')",
})
@Index('UQ_shop_payout_reference', ['mode', 'bankReference'], {
  unique: true,
  where: '"bankReference" IS NOT NULL',
})
@Index(['shopId', 'requestId'], { unique: true })
@Check('CHK_shop_payout_amount', 'amount > 0')
export class ShopPayout extends BaseEntity {
  @Column('uuid')
  shopId: string;
  @Column('uuid')
  ownerId: string;
  @Column({ type: 'varchar', length: 100 })
  requestId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: PayoutStatus;
  @Column('integer')
  amount: number;
  @Column('uuid')
  bankAccountId: string;
  @Column('jsonb')
  recipientSnapshot: RecipientSnapshot;
  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  followUpDueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  overdueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  operationalUpdateAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  followUpOverdueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
  @Column({ type: 'varchar', length: 200, nullable: true })
  bankReference: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  bankTransferredAt: Date | null;
  @Column({ type: 'text', nullable: true })
  transferEvidence: string | null;
  @Column({ type: 'text', nullable: true })
  recipientCheckEvidence: string | null;
  @Column({ type: 'text', nullable: true })
  reason: string | null;
}
@Entity('shop_payout_allocations')
@Index(['payoutId', 'kind', 'sourceId'], { unique: true })
@Check('CHK_shop_payout_allocation_positive', 'amount > 0')
export class ShopPayoutAllocation extends BaseEntity {
  @Column('uuid')
  payoutId: string;
  @ManyToOne(() => ShopPayout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payoutId' })
  payout: ShopPayout;
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
@Entity('shop_payout_events')
export class ShopPayoutEvent extends BaseEntity {
  @Column('uuid')
  payoutId: string;
  @Column('uuid')
  shopId: string;
  @Column({ type: 'varchar', length: 60 })
  type: string;
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;
  @Column('text')
  message: string;
}
@Entity('shop_payout_risks')
@Index(['shopId'], { unique: true })
export class ShopPayoutRisk extends BaseEntity {
  @Column('uuid')
  shopId: string;
  @Column({ type: 'text', nullable: true })
  reason: string | null;
  @Column('text')
  evidence: string;
  @Column('uuid')
  actorId: string;
}
