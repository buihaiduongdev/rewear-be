import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Order } from '@/modules/order/order.entity';
import { User } from '@/modules/user/entities';

@Entity('wallet_accounts')
@Index(['userId'], { unique: true })
@Check(
  'CHK_wallet_balance_safe',
  '"balance" >= 0 AND "balance" <= 9007199254740991',
)
export class WalletAccount extends BaseEntity {
  @Column('uuid') userId: string;
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
  @Column('uuid') userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column('uuid') orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column('integer') amount: number;
  @Column({ type: 'varchar', length: 32, default: 'ORDER_CANCELLED' })
  reason: 'ORDER_CANCELLED';
}
