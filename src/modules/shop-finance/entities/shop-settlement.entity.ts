import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { Order } from '@/modules/order/entities';
import { Shop } from '@/modules/shop/entities';

import { ShopLedgerEntry } from './shop-ledger.entity';

@Entity('shop_settlements')
@Index(['orderId'], { unique: true })
@Index(['creditId'], { unique: true })
@Index(['shopId', 'mode', 'createdAt'])
@Check('CHK_shop_settlement_nonnegative', '"amount" >= 0')
export class ShopSettlement extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  @Column('uuid')
  creditId: string;

  @ManyToOne(() => ShopLedgerEntry, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creditId' })
  credit: ShopLedgerEntry;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column('integer')
  amount: number;

  @Column({ type: 'integer', default: 0 })
  refundDebit: number;
}
