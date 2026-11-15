import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Order } from '@/modules/order/order.entity';
import { User } from '@/modules/user/entities';

import type { ReturnInspectionInput } from './shipment.type';

@Entity('shipment_return_inspections')
@Index(['orderId'], { unique: true })
export class ShipmentReturnInspection extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  actorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actorId' })
  actor: User;

  @Column({ type: 'varchar', length: 20 })
  condition: ReturnInspectionInput['condition'];

  @Column('text')
  reason: string;

  @Column('text')
  evidence: string;
}
