import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import type {
  CheckoutAddress,
  CheckoutState,
  RemovedCheckoutItem,
} from '../types/checkout.type';

@Entity('checkouts')
@Index('UQ_checkout_buyer_request', ['buyerId', 'requestId'], { unique: true })
@Index('IDX_checkout_expiry', ['status', 'expiresAt'])
export class Checkout extends BaseEntity {
  @Column('uuid')
  buyerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;
  @Column('uuid')
  requestId: string;
  @Column('uuid')
  addressId: string;
  @Column('jsonb')
  requestedProductIds: string[];
  @Column('jsonb')
  address: CheckoutAddress;
  @Column({ type: 'varchar', length: 20 })
  status: CheckoutState;
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
  @Column({ type: 'integer', default: 600 })
  holdSeconds: number;
  @Column({ type: 'jsonb', default: [] })
  removedItems: RemovedCheckoutItem[];
}
