import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('coin_accounts')
@Index(['userId'], { unique: true })
@Check(
  'CHK_coin_account_nonnegative',
  '"balance" >= 0 AND "heldBalance" >= 0 AND "simulationBalance" >= 0 AND "simulationHeldBalance" >= 0',
)
export class CoinAccount extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column('integer', { default: 0 })
  balance: number;

  @Column('integer', { default: 0 })
  heldBalance: number;

  @Column('integer', { default: 0 })
  simulationBalance: number;

  @Column('integer', { default: 0 })
  simulationHeldBalance: number;
}
