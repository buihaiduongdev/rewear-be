import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import type {
  ExcessPaymentState,
  ExcessPaymentTarget,
} from '../schemas/excess.schema';

@Entity('wallet_excess_payments')
@Check('CHK_excess_payment_positive', '"amount" > 0')
@Index(['buyerId', 'requestId'], { unique: true })
@Index(['providerOrderCode'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class ExcessPayment extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  requestId: string;

  @Column({ type: 'bigint', nullable: true })
  providerOrderCode: string | null;

  @Column('varchar', { length: 64 })
  fingerprint: string;

  @Column('jsonb')
  targets: ExcessPaymentTarget[];

  @Column('integer')
  amount: number;

  @Column('varchar', { length: 16 })
  state: ExcessPaymentState;

  @Column('text', { nullable: true })
  payUrl: string | null;

  @Column('timestamptz')
  nextQueryAt: Date;
}
