import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Order } from '@/modules/order/entities';
import type { OrderState } from '@/modules/order/schemas/order.schema';

import type { DisputeCaseState } from '../schemas/dispute.schema';

@Entity('dispute_cases')
@Index(['orderId'], { unique: true })
@Index(['shopId', 'createdAt'])
export class DisputeCase extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  shopId: string;

  @Column({ type: 'varchar', length: 24 })
  previousOrderStatus: OrderState;

  @Column({ type: 'varchar', length: 16 })
  state: DisputeCaseState;
}
