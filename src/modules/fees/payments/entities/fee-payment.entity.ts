import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type {
  FeePaymentState,
  FeeTarget,
  ProviderRefundState,
} from '../types/fee-payment.type';

@Entity('fee_payments')
@Index(['userId', 'requestId'], { unique: true })
export class FeePayment extends BaseEntity {
  @Column('uuid')
  userId: string;
  @Column('uuid')
  requestId: string;
  @Column('text')
  fingerprint: string;
  @Column('integer')
  amount: number;
  @Column('jsonb')
  targets: FeeTarget[];
  @Column('varchar')
  state: FeePaymentState;
  @Column({ type: 'text', nullable: true })
  payUrl: string | null;
  @Column('timestamptz')
  nextQueryAt: Date;
  @Column('timestamptz')
  targetDeadline: Date;
  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;
}
@Entity('fee_payment_captures')
@Index(['providerTransId'], { unique: true })
export class FeePaymentCapture extends BaseEntity {
  @Column('uuid')
  paymentId: string;
  @Column('varchar')
  providerTransId: string;
  @Column('integer')
  amount: number;
  @Column('integer')
  allocatedAmount: number;
}
@Entity('fee_provider_refunds')
@Index(['feeRefundId'], { unique: true })
export class FeeProviderRefund extends BaseEntity {
  @Column('uuid')
  captureId: string;
  @Column({ type: 'uuid', nullable: true })
  feeRefundId: string | null;
  @Column('uuid', { unique: true })
  requestId: string;
  @Column('integer')
  amount: number;
  @Column('varchar')
  state: ProviderRefundState;
  @Column('timestamptz')
  nextQueryAt: Date;
  @Column({ type: 'timestamptz', nullable: true })
  alertedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  responseDueAt: Date | null;
  @Column('jsonb', { default: [] })
  history: { at: string; state: string }[];
}
