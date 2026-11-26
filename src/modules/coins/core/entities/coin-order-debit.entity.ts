import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

@Entity('coin_order_debits')
@Check('CHK_coin_order_debit_positive', '"amount" > 0')
@Index(['orderId'], { unique: true })
export class CoinOrderDebit extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @Column('uuid')
  buyerId: string;

  @Column('varchar')
  mode: ReconciliationMode;

  @Column('integer')
  amount: number;
}
