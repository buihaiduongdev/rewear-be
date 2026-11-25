import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Order } from '@/modules/order/entities';

import type { HandoverAction } from '../schemas/late-handover.schema';

@Entity('fulfillment_notices')
@Index(['orderId', 'recipientId', 'action'], { unique: true })
@Index(['recipientId', 'createdAt'])
export class FulfillmentNotice extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  recipientId: string;

  @Column({ type: 'varchar', length: 40 })
  action: HandoverAction;

  @Column('text')
  reason: string;
}
