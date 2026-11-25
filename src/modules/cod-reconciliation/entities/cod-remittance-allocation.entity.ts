import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Order } from '@/modules/order/entities';

import { CodCollection } from './cod-collection.entity';
import { CodRemittance } from './cod-remittance.entity';

@Entity('cod_remittance_allocations')
@Index(['remittanceId', 'orderId'], { unique: true })
@Index(['collectionId', 'createdAt'])
@Check(
  'CHK_cod_allocation_value',
  '"cashAmount" >= 0 AND "feeDeducted" >= 0 AND "cashAmount"::bigint + "feeDeducted" > 0',
)
export class CodRemittanceAllocation extends BaseEntity {
  @Column('uuid')
  remittanceId: string;

  @ManyToOne(() => CodRemittance, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'remittanceId' })
  remittance: CodRemittance;

  @Column('uuid')
  collectionId: string;

  @ManyToOne(() => CodCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collectionId' })
  collection: CodCollection;

  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('integer')
  cashAmount: number;

  @Column('integer')
  feeDeducted: number;
}
