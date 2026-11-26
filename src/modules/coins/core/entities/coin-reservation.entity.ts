import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { CoinReservationState } from '../schemas/coin.schema';

@Entity('coin_reservations')
@Check('CHK_coin_reservation_positive', '"amount" > 0')
@Index(['checkoutId', 'state'])
@Index(['orderId', 'state'])
export class CoinReservation extends BaseEntity {
  @Column('uuid')
  checkoutId: string;
  @Column('uuid', { nullable: true })
  orderId: string | null;
  @Column('uuid')
  grantId: string;
  @Column('integer')
  amount: number;
  @Column('varchar')
  state: CoinReservationState;
  @Column('timestamptz', { nullable: true })
  expiresAt: Date | null;
}
