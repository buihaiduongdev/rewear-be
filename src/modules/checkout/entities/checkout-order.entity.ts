import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Shop } from '@/modules/shop/entities';

import type { CheckoutAddress, CheckoutItem } from '../types/checkout.type';
import { Checkout } from './checkout.entity';

@Entity('checkout_orders')
@Index('IDX_checkout_orders_checkout', ['checkoutId'])
export class CheckoutOrder extends BaseEntity {
  @Column('uuid')
  checkoutId: string;
  @ManyToOne(() => Checkout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkoutId' })
  checkout: Checkout;
  @Column('uuid')
  shopId: string;
  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;
  @Column('jsonb')
  address: CheckoutAddress;
  @Column('jsonb')
  items: CheckoutItem[];
  @Column('bigint', {
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  subtotal: number;
  @Column({ type: 'integer', nullable: true })
  shippingFee: number | null;
}
