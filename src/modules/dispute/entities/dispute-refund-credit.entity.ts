import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { DisputeDecision } from './dispute-decision.entity';

@Entity('dispute_refund_credits')
@Index(['decisionId'], { unique: true })
@Index(['remedyKey', 'mode'])
@Index(['shopId', 'mode'])
@Check(
  'CHK_dispute_refund_credit_money',
  '"amount" >= 0 AND "commissionReversed" >= 0 AND "sellerDebit" >= 0 AND "amount" = "commissionReversed" + "sellerDebit" AND "advanceAmount" >= 0 AND "advanceAmount" <= "amount"',
)
export class DisputeRefundCredit extends BaseEntity {
  @Column('uuid')
  decisionId: string;

  @ManyToOne(() => DisputeDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decisionId' })
  decision: DisputeDecision;

  @Column('uuid')
  orderId: string;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  shopId: string;

  @Column({ type: 'varchar', length: 73 })
  remedyKey: string;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column('integer')
  amount: number;

  @Column('integer')
  commissionReversed: number;

  @Column('integer')
  sellerDebit: number;

  @Column('integer')
  advanceAmount: number;
}
