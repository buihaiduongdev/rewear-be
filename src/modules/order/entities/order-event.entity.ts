import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { OrderEventAction } from '../schemas/order.schema';
import { Order } from './order.entity';

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
}
