import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ExcessPaymentState } from '../schemas/excess.schema';
import { ExcessCapture } from './excess-capture.entity';
import { ExcessReturn } from './excess-return.entity';

@Entity('wallet_excess_provider_refunds')
@Check('CHK_excess_provider_refund_positive', '"amount" > 0')
@Index(['returnId'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class ExcessProviderRefund extends BaseEntity {
  @ManyToOne(() => ExcessCapture, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'captureId' })
  capture: ExcessCapture;

  @ManyToOne(() => ExcessReturn, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'returnId' })
  correctionReturn: ExcessReturn | null;

  @Column('uuid')
  captureId: string;

  @Column('uuid', { nullable: true })
  returnId: string | null;

  @Column('integer')
  amount: number;

  @Column('uuid')
  requestId: string;

  @Column('varchar', { length: 16 })
  state: ExcessPaymentState;

  @Column('timestamptz')
  nextQueryAt: Date;

  @Column('timestamptz', { nullable: true })
  alertedAt: Date | null;

  @Column('timestamptz', { nullable: true })
  responseDueAt: Date | null;
}
