import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { FeeDisclosure } from '@/modules/fees/disclosure/fee-disclosure.schema';
import { User } from '@/modules/user/entities';

import type {
  CheckoutAddress,
  CheckoutState,
  RemovedCheckoutItem,
} from '../schemas/checkout.schema';

@Entity('checkouts')
@Index('UQ_checkout_buyer_request', ['buyerId', 'requestId'], { unique: true })
@Index('IDX_checkout_expiry', ['status', 'expiresAt'])
export class Checkout extends BaseEntity {
  @Column({ default: false })
  identityReviewRequired?: boolean;
  @Column({ type: 'varchar', length: 64, nullable: true })
  identityConfirmedQuote?: string | null;
  @Column({ type: 'integer', default: 0 })
  coinDiscount: number;
  @Column({ type: 'varchar', length: 20, nullable: true })
  coinMode: ReconciliationMode | null;
  @Column({ type: 'jsonb', nullable: true })
  feeDisclosure: FeeDisclosure | null;
  @Column({ default: false })
  walletPaymentSelected: boolean;
  @Column({ type: 'timestamptz', nullable: true })
  walletSelectedAt: Date | null;
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
