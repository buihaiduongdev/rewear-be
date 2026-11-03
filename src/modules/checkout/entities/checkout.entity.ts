import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

export type CheckoutState = 'HELD' | 'EMPTY' | 'CANCELLED' | 'EXPIRED';
export type CheckoutAddress = {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  countryCode: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  postalCode: string | null;
  deliveryInstructions: string | null;
};
export type CheckoutItem = {
  productId: string;
  title: string;
  price: number;
  revision: number;
  size: string | null;
  condition: string;
  coverUrl: string | null;
};
export type RemovedCheckoutItem = { productId: string; reason: string };

@Entity('checkouts')
@Index('UQ_checkout_buyer_request', ['buyerId', 'requestId'], { unique: true })
@Index('IDX_checkout_expiry', ['status', 'expiresAt'])
export class Checkout extends BaseEntity {
  @Column('uuid') buyerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;
  @Column('uuid') requestId: string;
  @Column('uuid') addressId: string;
  @Column('jsonb') requestedProductIds: string[];
  @Column('jsonb') address: CheckoutAddress;
  @Column({ type: 'varchar', length: 20 }) status: CheckoutState;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'integer', default: 600 }) holdSeconds: number;
  @Column({ type: 'jsonb', default: [] }) removedItems: RemovedCheckoutItem[];
}

// Provisional orders: no payment, shipping fee, or seller processing yet.
@Entity('checkout_orders')
@Index('IDX_checkout_orders_checkout', ['checkoutId'])
export class CheckoutOrder extends BaseEntity {
  @Column('uuid') checkoutId: string;
  @ManyToOne(() => Checkout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkoutId' })
  checkout: Checkout;
  @Column({ type: 'varchar', length: 10 }) sourceType: 'USER' | 'SHOP';
  @Column('uuid') sourceId: string;
  @Column({ length: 255 }) sourceName: string;
  @Column('jsonb') address: CheckoutAddress;
  @Column('jsonb') items: CheckoutItem[];
  @Column('bigint', {
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  subtotal: number;
  @Column({ type: 'integer', nullable: true }) shippingFee: number | null;
}
