import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { CodCollection } from '@/modules/cod-reconciliation/cod-reconciliation.entity';
import type { ShopLedgerType } from '@/modules/cod-reconciliation/cod-reconciliation.type';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/cod-reconciliation.type';
import { Order } from '@/modules/order/order.entity';
import { Shop } from '@/modules/shop/entities';

@Entity('shop_ledger_entries')
@Index(['orderId'], { unique: true })
@Index(['collectionId'], { unique: true })
@Index(['shopId', 'mode', 'createdAt'])
@Check('CHK_shop_ledger_nonnegative', '"amount" >= 0')
export class ShopLedgerEntry extends BaseEntity {
  @Column('uuid')
  shopId: string;
  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;
  @Column('uuid')
  orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column('uuid')
  collectionId: string;
  @ManyToOne(() => CodCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collectionId' })
  collection: CodCollection;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column({ type: 'varchar', length: 32 })
  type: ShopLedgerType;
  @Column('integer')
  amount: number;

  @Column('uuid')
  actorId: string;
}
