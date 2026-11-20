import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { MAX_SAFE_BALANCE } from '@/common/constants/money.constant';
import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { Order } from '@/modules/order/entities/order.entity';
import { User } from '@/modules/user/entities';

import { WALLET_CREDIT_REASON } from '../constants/wallet.constant';
import type { WalletCreditReason } from '../types/wallet.type';

@Entity('wallet_accounts')
@Check(
  'CHK_wallet_held_safe',
  `"heldBalance" >= 0 AND "balance" + "heldBalance" <= ${MAX_SAFE_BALANCE}`,
)
@Check(
  'CHK_wallet_simulation_held_safe',
  `"simulationHeldBalance" >= 0 AND "simulationBalance" + "simulationHeldBalance" <= ${MAX_SAFE_BALANCE}`,
)
@Check(
  'CHK_wallet_simulation_balance_safe',
  `"simulationBalance" >= 0 AND "simulationBalance" <= ${MAX_SAFE_BALANCE}`,
)
@Index(['userId'], { unique: true })
@Check(
  'CHK_wallet_balance_safe',
  `"balance" >= 0 AND "balance" <= ${MAX_SAFE_BALANCE}`,
)
export class WalletAccount extends BaseEntity {
  @Column('bigint', {
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  heldBalance: number;
  @Column('bigint', {
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  simulationHeldBalance: number;
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

  @Column('bigint', {
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  simulationBalance: number;
}

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
