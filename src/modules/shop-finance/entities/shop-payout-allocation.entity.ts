import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type { PayoutSource } from '../schemas/payout.schema';
import { ShopPayout } from './shop-payout.entity';

@Entity('shop_payout_allocations')
@Index(['payoutId', 'kind', 'sourceId'], { unique: true })
@Check('CHK_shop_payout_allocation_positive', 'amount > 0')
export class ShopPayoutAllocation extends BaseEntity {
  @Column('uuid')
  payoutId: string;

  @ManyToOne(() => ShopPayout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payoutId' })
  payout: ShopPayout;

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
