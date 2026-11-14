import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { CarrierQuoteInput } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { Order } from '@/modules/order/order.entity';

@Entity('shipments')
@Index(['orderId'], { unique: true })
@Index(['orderCode'], { unique: true })
@Index(['nextQueryAt'])
export class Shipment extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'varchar', length: 30 })
  state: 'CREATING' | 'UNKNOWN' | 'BOOKED' | 'CANCEL_PENDING' | 'CANCELLED';

  @Column({ type: 'varchar', length: 50, nullable: true })
  orderCode: string | null;

  @Column('jsonb')
  payload: Record<string, unknown>;

  @Column('jsonb')
  input: CarrierQuoteInput;

  @Column('jsonb')
  quotedParcel: CarrierQuoteInput['parcel'];

  @Column('integer')
  codAmount: number;

  @Column({ type: 'integer', nullable: true })
  carrierFee: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextQueryAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  providerStatus: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  providerUpdatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pickedObservedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelRequestedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  codCollectedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  carrierTransferredAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewReason: string | null;
}
