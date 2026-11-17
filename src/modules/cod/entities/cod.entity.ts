import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { COD_RESTRICTION_CAUSE } from '../constants/cod.constant';
import type { CodRestrictionCause } from '../types/cod.type';

@Entity('cod_buyer_cancellations')
@Index(['buyerId', 'checkoutId'], { unique: true })
@Index(['buyerId', 'createdAt'])
export class CodBuyerCancellation extends BaseEntity {
  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  checkoutId: string;
}

@Entity('cod_restrictions')
@Index(['buyerId', 'createdAt'])
export class CodRestriction extends BaseEntity {
  @Column('uuid')
  buyerId: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: COD_RESTRICTION_CAUSE.REPEATED_CANCELLATION,
  })
  cause: CodRestrictionCause;

  @Column({ type: 'timestamptz', nullable: true })
  blockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  resolutionReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;
}
