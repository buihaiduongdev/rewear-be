import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type { PayoutStatus, RecipientSnapshot } from '../schemas/payout.schema';

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
