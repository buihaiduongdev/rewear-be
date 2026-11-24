import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type {
  CheckoutAddress,
  CheckoutItem,
} from '@/modules/checkout/types/checkout.type';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import type { FeeDisclosure } from '@/modules/fees/disclosure/fee-disclosure.schema';
import { PaymentAttempt } from '@/modules/payment/entities/payment.entity';
import { WalletDebit } from '@/modules/wallet/checkout/entities/wallet-checkout.entity';

import {
  ORDER_PAYMENT_METHOD,
  ORDER_POLICY,
} from '../constants/order.constant';
import type {
  OrderCancellationReason,
  OrderCancelState,
  OrderEventAction,
  OrderPaymentMethod,
  OrderState,
} from '../types/order.type';

@Entity('orders')
@Index(['checkoutOrderId'], { unique: true })
@Index('UQ_orders_orderCode', ['orderCode'], { unique: true })
@Index(['buyerId', 'createdAt'])
@Index(['shopId', 'status', 'createdAt'])
@Index(['status', 'sellerConfirmBy'])
export class Order extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 13,
    default: () =>
      "('RW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)))",
  })
  orderCode: string;

  @Column({ type: 'integer', default: 0 })
  coinDiscount: number;
  @Column({ type: 'varchar', length: 20, nullable: true })
  coinMode: ReconciliationMode | null;
  @Column({ type: 'jsonb', nullable: true })
  feeDisclosure: FeeDisclosure | null;
  @Column({ type: 'uuid', nullable: true })
  walletDebitId: string | null;
  @ManyToOne(() => WalletDebit, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'walletDebitId' })
  walletDebit: WalletDebit | null;
  @Column({ type: 'timestamptz', nullable: true })
  receiptConfirmedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryVerifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  disputeDeadlineAt: Date | null;

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

  @Column({ type: 'varchar', length: 10, default: ORDER_PAYMENT_METHOD.MOMO })
  paymentMethod: OrderPaymentMethod;

  @Column({ type: 'timestamptz', nullable: true })
  handoverBy: Date | null;

  @Column({ default: false })
  handoverReviewRequired: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryObservedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  carrierReturnedAt: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cancelState: OrderCancelState | null;

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

  @Column({
    type: 'integer',
    default: ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS,
  })
  commissionBasisPoints: number;

  @Column('timestamptz')
  sellerConfirmBy: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cancellationReason: OrderCancellationReason | null;

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
