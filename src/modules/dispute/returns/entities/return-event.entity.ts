import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeReturn } from './dispute-return.entity';

@Entity('return_events')
@Index(['requestId'], { unique: true })
export class ReturnEvent extends BaseEntity {
  @Column('uuid')
  returnId: string;

  @ManyToOne(() => DisputeReturn, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'returnId' })
  returnCase: DisputeReturn;

  @Column('uuid')
  requestId: string;

  @Column('uuid')
  actorId: string;

  @Column({ length: 64 })
  requestFingerprint: string;

  @Column({ length: 32 })
  action: string;

  @Column('text')
  reason: string;

  @Column('jsonb')
  data: Record<string, unknown>;
}
