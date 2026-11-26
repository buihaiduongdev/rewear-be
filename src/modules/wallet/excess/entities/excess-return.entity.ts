import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type {
  ExcessMethod,
  ExcessPaymentState,
} from '../schemas/excess.schema';
import { ExcessCollection } from './excess-collection.entity';

@Entity('wallet_excess_returns')
@Index(['collectionId'])
@Index(['buyerId', 'mode'])
@Check('CHK_excess_return_positive', '"amount" > 0')
export class ExcessReturn extends BaseEntity {
  @ManyToOne(() => ExcessCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collectionId' })
  collection: ExcessCollection;

  @Column('uuid')
  excessId: string;

  @Column('uuid')
  collectionId: string;

  @Column('uuid')
  buyerId: string;

  @Column('varchar', { length: 16 })
  mode: ReconciliationMode;

  @Column('varchar', { length: 16 })
  method: ExcessMethod;

  @Column('integer')
  amount: number;

  @Column('varchar', { length: 16 })
  state: ExcessPaymentState;
}
