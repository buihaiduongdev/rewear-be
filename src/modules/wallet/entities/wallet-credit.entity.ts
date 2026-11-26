import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { Order } from '@/modules/order/entities';
import { User } from '@/modules/user/entities';

import { WALLET_CREDIT_REASON } from '../constants/wallet.constant';
import type { WalletCreditReason } from '../schemas/wallet.schema';

@Entity('wallet_credits')
@Index(['orderId'], { unique: true })
@Index(['userId', 'createdAt'])
@Check('CHK_wallet_credit_positive', '"amount" > 0')
export class WalletCredit extends BaseEntity {
  @Column({ type: 'varchar', length: 16, nullable: true })
  mode: ReconciliationMode | null;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('integer')
  amount: number;

  @Column({
    type: 'varchar',
    length: 32,
    default: WALLET_CREDIT_REASON.ORDER_CANCELLED,
  })
  reason: WalletCreditReason;
}
