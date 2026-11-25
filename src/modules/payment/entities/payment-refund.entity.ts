import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { RefundReason, RefundState } from '../schemas/payment.schema';
import { PaymentAttempt } from './payment-attempt.entity';

@Entity('payment_refunds')
@Index(['paymentId'])
@Index(['providerTransId'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class PaymentRefund extends BaseEntity {
  @Column('uuid')
  paymentId: string;

  @Column({ type: 'varchar', length: 64 })
  providerTransId: string;

  @ManyToOne(() => PaymentAttempt, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment: PaymentAttempt;

  @Column('integer')
  amount: number;

  @Column({ type: 'varchar', length: 32 })
  reason: RefundReason;

  @Column({ type: 'varchar', length: 24 })
  state: RefundState;

  @Column('timestamptz')
  nextQueryAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  alertedAt: Date | null;
}
