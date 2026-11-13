import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ShippingQuoteResult } from '../schemas/shipping-quote.schema';
import type { QuoteInputSnapshot } from '../types/shipping-quote.type';
import { Checkout } from './checkout.entity';

@Entity('checkout_shipping_quotes')
@Index('IDX_checkout_shipping_quotes_checkout', ['checkoutId'])
export class CheckoutShippingQuote extends BaseEntity {
  @Column('uuid')
  checkoutId: string;
  @ManyToOne(() => Checkout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkoutId' })
  checkout: Checkout;
  @Column({ length: 64 })
  fingerprint: string;
  // Private provider input snapshot: never serialized into a buyer response.
  @Column('jsonb')
  inputs: QuoteInputSnapshot[];
  @Column('jsonb')
  result: ShippingQuoteResult;
}
