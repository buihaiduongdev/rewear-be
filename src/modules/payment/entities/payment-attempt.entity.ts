import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';

import { PAYMENT_PROVIDER } from '../constants/payment.constant';
import type {
  AttemptState,
  PaymentOrderSnapshot,
  PaymentProvider,
} from '../schemas/payment.schema';

export type { PaymentOrderSnapshot } from '../schemas/payment.schema';

@Entity('payment_attempts')
@Index(['checkoutId', 'requestId'], { unique: true })
@Index(['providerOrderCode'], { unique: true })
@Index(['providerTransId'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class PaymentAttempt extends BaseEntity {
  @Column({ type: 'varchar', length: 16, default: PAYMENT_PROVIDER.PAYOS })
  provider: PaymentProvider;

  @Column('uuid')
  checkoutId: string;

  @ManyToOne(() => Checkout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkoutId' })
  checkout: Checkout;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  requestId: string;

  @Column({ type: 'bigint', nullable: true })
  providerOrderCode: string | null;

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

  @Column({ type: 'varchar', length: 24, nullable: true })
  providerStatus: string | null;

  @Column({ type: 'integer', nullable: true })
  capturedAmount: number | null;

  @Column('timestamptz')
  nextQueryAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;
}
