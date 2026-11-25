import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('coin_movements')
export class CoinMovement extends BaseEntity {
  @Column('uuid')
  grantId: string;
  @Column('varchar')
  kind: string;
  @Column('integer')
  amount: number;
  @Column('uuid', { nullable: true })
  referenceId: string | null;
}
