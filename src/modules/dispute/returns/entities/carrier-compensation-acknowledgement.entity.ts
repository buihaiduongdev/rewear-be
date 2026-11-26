import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeReturnException } from './dispute-return-exception.entity';

@Entity('carrier_compensation_acknowledgements')
@Index(['exceptionId'], { unique: true })
@Check('CHK_carrier_ack_amount', '"amount" > 0')
export class CarrierCompensationAcknowledgement extends BaseEntity {
  @Column('uuid')
  exceptionId: string;

  @ManyToOne(() => DisputeReturnException, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'exceptionId' })
  exception: DisputeReturnException;

  @Column('integer')
  amount: number;

  @Column('text')
  conditions: string;

  @Column('text')
  evidence: string;

  @Column('uuid')
  actorId: string;
}
