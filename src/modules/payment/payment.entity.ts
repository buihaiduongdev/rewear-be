import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import type {
  CheckoutAddress,
  CheckoutItem,
} from '@/modules/checkout/types/checkout.type';

import type { AttemptState } from './payment.policy';

export interface PaymentOrderSnapshot {
  checkoutOrderId: string;
  shopId: string;
  shopName: string;
  subtotal: number;
  shippingFee: number;
  address: CheckoutAddress;
  items: CheckoutItem[];
}

@Entity('payment_attempts')
@Index(['checkoutId', 'requestId'], { unique: true })
@Index(['providerTransId'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class PaymentAttempt extends BaseEntity {
  @Column('uuid') checkoutId: string;
  @ManyToOne(() => Checkout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkoutId' })
  checkout: Checkout;
  @Column('uuid') buyerId: string;
  @Column('uuid') requestId: string;
  @Column('integer') amount: number;
  @Column('jsonb') orders: PaymentOrderSnapshot[];
  @Column({ type: 'varchar', length: 24 }) state: AttemptState;
  @Column({ type: 'text', nullable: true }) payUrl: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) providerTransId:
    string | null;
  @Column({ type: 'integer', nullable: true }) resultCode: number | null;
  @Column({ type: 'integer', nullable: true }) capturedAmount: number | null;
  @Column('timestamptz') nextQueryAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) paidAt: Date | null;
}

@Entity('payment_refunds')
@Index(['paymentId'])
@Index(['providerTransId'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class PaymentRefund extends BaseEntity {
  @Column('uuid') paymentId: string;
  @Column({ type: 'varchar', length: 64 }) providerTransId: string;
  @ManyToOne(() => PaymentAttempt, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment: PaymentAttempt;
  @Column('integer') amount: number;
  @Column({ type: 'varchar', length: 32 }) reason: 'LATE_OR_INVALID_CAPTURE';
  @Column({ type: 'varchar', length: 24 }) state:
    'QUEUED' | 'UNKNOWN' | 'COMPLETED' | 'REVIEW_REQUIRED';
  @Column('timestamptz') nextQueryAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) alertedAt: Date | null;
}
