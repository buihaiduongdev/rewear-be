import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';

import type {
  AttemptState,
  PaymentOrderSnapshot,
  RefundReason,
  RefundState,
} from '../types/payment.type';

export type { PaymentOrderSnapshot } from '../types/payment.type';

@Entity('payment_attempts')
@Index(['checkoutId', 'requestId'], { unique: true })
@Index(['providerTransId'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class PaymentAttempt extends BaseEntity {
  @Column('uuid')
  checkoutId: string;

  @ManyToOne(() => Checkout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkoutId' })
  checkout: Checkout;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  requestId: string;

  @Column('integer')
  amount: number;

  @Column('jsonb')
  orders: PaymentOrderSnapshot[];

  @Column({ type: 'varchar', length: 24 })
  state: AttemptState;

  @Column({ type: 'text', nullable: true })
  payUrl: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  providerTransId: string | null;

  @Column({ type: 'integer', nullable: true })
  resultCode: number | null;

  @Column({ type: 'integer', nullable: true })
  capturedAmount: number | null;

  @Column('timestamptz')
  nextQueryAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;
}

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
