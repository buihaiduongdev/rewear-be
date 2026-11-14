import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type {
  CheckoutAddress,
  CheckoutItem,
} from '@/modules/checkout/types/checkout.type';
import { PaymentAttempt } from '@/modules/payment/payment.entity';

import type { OrderState } from './order.type';

@Entity('orders')
@Index(['checkoutOrderId'], { unique: true })
@Index(['buyerId', 'createdAt'])
@Index(['shopId', 'status', 'createdAt'])
@Index(['status', 'sellerConfirmBy'])
export class Order extends BaseEntity {
  @Column('uuid') checkoutOrderId: string;
  @Column('uuid') paymentId: string;
  @ManyToOne(() => PaymentAttempt, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment: PaymentAttempt;
  @Column('uuid') buyerId: string;
  @Column('uuid') shopId: string;
  @Column({ length: 255 }) shopName: string;
  @Column({ type: 'varchar', length: 24 }) status: OrderState;
  @Column('integer') subtotal: number;
  @Column('integer') shippingFee: number;
  @Column('integer') total: number;
  @Column('jsonb') address: CheckoutAddress;
  @Column('jsonb') items: CheckoutItem[];
  @Column({ type: 'integer', default: 300 }) commissionBasisPoints: number;
  @Column('timestamptz') sellerConfirmBy: Date;
  @Column({ type: 'timestamptz', nullable: true }) acceptedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) cancelledAt: Date | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) cancellationReason:
    'SELLER_REJECTED' | 'SELLER_CONFIRM_TIMEOUT' | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) cancellationNote:
    string | null;
  @Column({ type: 'jsonb', default: [] }) stockReleaseReviewIds: string[];
  @Column({ type: 'timestamptz', nullable: true }) expiryRetryAt: Date | null;
}

@Entity('order_events')
@Index(['orderId', 'action'], { unique: true })
export class OrderEvent extends BaseEntity {
  @Column('uuid') orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column({ type: 'varchar', length: 20 }) action:
    'PAID' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  @Column({ type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) reason:
    string | null;
}
