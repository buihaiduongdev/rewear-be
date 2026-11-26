import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { FeeCollection } from '@/modules/fees/entities';
import type { PayoutSource } from '@/modules/shop-finance/payouts/schemas/payout.schema';

@Entity('fee_offset_allocations')
@Index(['collectionId', 'kind', 'sourceId'], { unique: true })
@Check('CHK_fee_offset_positive', 'amount > 0')
export class FeeOffsetAllocation extends BaseEntity {
  @Column('uuid')
  collectionId: string;

  @ManyToOne(() => FeeCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collectionId' })
  collection: FeeCollection;

  @Column({ type: 'varchar', length: 20 })
  kind: PayoutSource['kind'];

  @Column('uuid')
  sourceId: string;

  @Column('uuid')
  orderId: string;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column('integer')
  amount: number;
}
