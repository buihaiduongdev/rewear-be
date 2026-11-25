import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('coin_program_mistakes')
@Index(['grantId'], { unique: true })
export class CoinProgramMistake extends BaseEntity {
  @Column('uuid')
  grantId: string;
  @Column('integer')
  target: number;
  @Column('integer')
  platformExpense: number;
  @Column('text')
  evidence: string;
  @Column('uuid')
  actorId: string;
}
