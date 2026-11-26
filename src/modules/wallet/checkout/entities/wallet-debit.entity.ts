import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { User } from '@/modules/user/entities';

import { WalletCheckoutHold } from './wallet-checkout-hold.entity';

@Entity('wallet_debits')
@Index(['holdId'], { unique: true })
@Index(['buyerId', 'requestId'], { unique: true })
@Check('CHK_wallet_debit_amount', '"amount" > 0')
@Check(
  'CHK_wallet_debit_mode',
  `"mode" IN ('${RECONCILIATION_MODE.EVIDENCE}','${RECONCILIATION_MODE.SIMULATION}')`,
)
export class WalletDebit extends BaseEntity {
  @Column('uuid')
  holdId: string;

  @OneToOne(() => WalletCheckoutHold, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'holdId' })
  hold: WalletCheckoutHold;

  @Column('uuid')
  requestId: string;

  @Column('uuid')
  buyerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @Column('uuid')
  checkoutId: string;

  @ManyToOne(() => Checkout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkoutId' })
  checkout: Checkout;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column('integer')
  amount: number;
}
