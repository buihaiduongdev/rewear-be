import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { FeePaymentState, FeeTarget } from '../schemas/fee-payment.schema';

@Entity('fee_payments')
@Index(['userId', 'requestId'], { unique: true })
@Index(['providerOrderCode'], { unique: true })
export class FeePayment extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column('uuid')
  requestId: string;

  @Column({ type: 'bigint', nullable: true })
  providerOrderCode: string | null;

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
