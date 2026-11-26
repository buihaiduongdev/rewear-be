import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ExcessPaymentTarget } from '../schemas/excess.schema';
import { ExcessPayment } from './excess-payment.entity';

@Entity('wallet_excess_captures')
@Check(
  'CHK_excess_capture_capacity',
  '"amount" > 0 AND "allocated" >= 0 AND "allocated" <= "amount"',
)
@Index(['providerTransId'], { unique: true })
export class ExcessCapture extends BaseEntity {
  @ManyToOne(() => ExcessPayment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment: ExcessPayment;

  @Column('uuid')
  paymentId: string;

  @Column('varchar', { length: 64 })
  providerTransId: string;

  @Column('integer')
  amount: number;

  @Column('integer', { default: 0 })
  allocated: number;

  @Column('jsonb', { default: [] })
  reservations: ExcessPaymentTarget[];
}
