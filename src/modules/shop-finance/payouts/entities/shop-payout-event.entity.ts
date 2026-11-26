import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('shop_payout_events')
export class ShopPayoutEvent extends BaseEntity {
  @Column('uuid')
  payoutId: string;

  @Column('uuid')
  shopId: string;

  @Column({ type: 'varchar', length: 60 })
  type: string;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column('text')
  message: string;
}
