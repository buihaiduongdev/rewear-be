import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('shop_payout_risks')
@Index(['shopId'], { unique: true })
export class ShopPayoutRisk extends BaseEntity {
  @Column('uuid')
  shopId: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column('text')
  evidence: string;

  @Column('uuid')
  actorId: string;
}
