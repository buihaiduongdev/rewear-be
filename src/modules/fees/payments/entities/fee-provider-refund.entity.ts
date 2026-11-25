import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ProviderRefundState } from '../schemas/fee-payment.schema';

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
