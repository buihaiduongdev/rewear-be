import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

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

  @Column({ type: 'varchar', length: 30, default: 'REPEATED_CANCELLATION' })
  cause: 'REPEATED_CANCELLATION';

  @Column({ type: 'timestamptz', nullable: true })
  blockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  resolutionReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;
}
