import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ReturnBookingState } from '../constants/return-booking.constant';

@Entity('dispute_return_bookings')
@Index(['returnId'], { unique: true, where: '"active" = true' })
@Index(['clientCode'], { unique: true })
@Index(['requestId'], { unique: true })
@Index(['orderCode'], { unique: true })
export class ReturnBooking extends BaseEntity {
  @Column({ type: 'timestamptz', nullable: true })
  nextQueryAt: Date | null;
  @Column('uuid')
  returnId: string;
  @Column({ default: true })
  active: boolean;
  @Column('jsonb', { nullable: true })
  priorLabel: {
    code: string | null;
    instructions: string | null;
    notifiedAt: string | null;
    handoverBy: string | null;
  } | null;
  @Column('uuid')
  requestId: string;
  @Column('varchar', { length: 64 })
  fingerprint: string;
  @Column('uuid')
  clientCode: string;
  @Column('varchar', { length: 20 })
  state: ReturnBookingState;
  @Column('varchar', { length: 16, default: 'SIMULATION' })
  mode: 'SIMULATION';
  @Column('jsonb')
  payload: Record<string, unknown>;
  @Column('integer')
  accountId: number;
  @Column('varchar', { length: 50, nullable: true })
  orderCode: string | null;
  @Column('varchar', { length: 64, nullable: true })
  observedStatus: string | null;
  @Column('timestamptz', { nullable: true })
  observedAt: Date | null;
  @Column({ default: false })
  reviewRequired: boolean;
}
