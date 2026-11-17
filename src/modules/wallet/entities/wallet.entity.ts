import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { MAX_SAFE_BALANCE } from '@/common/constants/money.constant';
import { BaseEntity } from '@/common/entities';
import { Order } from '@/modules/order/entities/order.entity';
import { User } from '@/modules/user/entities';

import { WALLET_CREDIT_REASON } from '../constants/wallet.constant';
import type { WalletCreditReason } from '../types/wallet.type';

@Entity('wallet_accounts')
@Index(['userId'], { unique: true })
@Check(
  'CHK_wallet_balance_safe',
  `"balance" >= 0 AND "balance" <= ${MAX_SAFE_BALANCE}`,
)
export class WalletAccount extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('bigint', {
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  balance: number;
}

@Entity('wallet_credits')
@Index(['orderId'], { unique: true })
@Index(['userId', 'createdAt'])
@Check('CHK_wallet_credit_positive', '"amount" > 0')
export class WalletCredit extends BaseEntity {
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
