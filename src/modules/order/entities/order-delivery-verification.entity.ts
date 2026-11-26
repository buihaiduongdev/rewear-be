import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { Order } from './order.entity';

@Entity('order_delivery_verifications')
@Index(['orderId'], { unique: true })
export class OrderDeliveryVerification extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('timestamptz')
  deliveredAt: Date;

  @Column('timestamptz')
  disputeDeadlineAt: Date;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column('uuid')
  actorId: string;

  @Column('text')
  reason: string;

  @Column('text')
  evidence: string;
}
