import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type {
  CheckoutAddress,
  CheckoutItem,
} from '@/modules/checkout/types/checkout.type';
import { PaymentAttempt } from '@/modules/payment/payment.entity';

import type { OrderEventAction, OrderState } from './order.type';

@Entity('orders')
@Index(['checkoutOrderId'], { unique: true })
@Index(['buyerId', 'createdAt'])
@Index(['shopId', 'status', 'createdAt'])
@Index(['status', 'sellerConfirmBy'])
export class Order extends BaseEntity {
  @Column('uuid')
  checkoutOrderId: string;

  @Column({ type: 'uuid', nullable: true })
  paymentId: string | null;

  @ManyToOne(() => PaymentAttempt, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'paymentId' })
  payment: PaymentAttempt | null;

  @Index('IDX_orders_checkout')
  @Column({ type: 'uuid', nullable: true })
  checkoutId: string | null;

  @Column({ type: 'varchar', length: 10, default: 'MOMO' })
  paymentMethod: 'MOMO' | 'COD';

  @Column({ type: 'timestamptz', nullable: true })
  handoverBy: Date | null;

  @Column({ default: false })
  handoverReviewRequired: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryObservedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  carrierReturnedAt: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cancelState:
    'PENDING' | 'APPROVED' | 'REJECTED' | 'ADMIN_REVIEW' | 'CLOSED' | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelRequestedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelRespondBy: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelReviewUntil: Date | null;

  @Column({ type: 'text', nullable: true })
  cancelDecisionReason: string | null;

  @Column({ type: 'text', nullable: true })
  cancelDecisionEvidence: string | null;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  shopId: string;

  @Column({ length: 255 })
  shopName: string;

  @Column({ type: 'varchar', length: 24 })
  status: OrderState;

  @Column('integer')
  subtotal: number;

  @Column('integer')
  shippingFee: number;

  @Column('integer')
  total: number;

  @Column('jsonb')
  address: CheckoutAddress;

  @Column('jsonb')
  items: CheckoutItem[];

  @Column({ type: 'integer', default: 300 })
  commissionBasisPoints: number;

  @Column('timestamptz')
  sellerConfirmBy: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cancellationReason:
    | 'SELLER_REJECTED'
    | 'SELLER_CONFIRM_TIMEOUT'
    | 'BUYER_CANCELLED'
    | 'BUYER_CANCEL_APPROVED'
    | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  cancellationNote: string | null;

  @Column({ type: 'jsonb', default: [] })
  stockReleaseReviewIds: string[];

  @Column({ type: 'timestamptz', nullable: true })
  expiryRetryAt: Date | null;
}

@Entity('order_events')
@Index(['orderId', 'action'], { unique: true })
export class OrderEvent extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'varchar', length: 40 })
  action: OrderEventAction;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  evidence: string | null;

  @Column({ type: 'boolean', nullable: true })
  approved: boolean | null;
}
