import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type { ExcessMethod } from '../schemas/excess.schema';
import { WalletExcess } from './wallet-excess.entity';

@Entity('wallet_excess_collections')
@Index(['excessId', 'method', 'sourceId'], { unique: true })
@Index(['buyerId', 'mode'])
@Check('CHK_excess_collection_positive', '"amount" > 0')
export class ExcessCollection extends BaseEntity {
  @ManyToOne(() => WalletExcess, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'excessId' })
  recovery: WalletExcess;

  @Column('uuid')
  excessId: string;

  @Column('uuid')
  buyerId: string;

  @Column('varchar', { length: 16 })
  mode: ReconciliationMode;

  @Column('varchar', { length: 16 })
  method: ExcessMethod;

  @Column('uuid')
  sourceId: string;

  @Column('integer')
  amount: number;
}
