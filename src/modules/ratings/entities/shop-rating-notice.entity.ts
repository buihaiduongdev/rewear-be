import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('shop_rating_notices')
@Index(['ratingId', 'revision'], { unique: true })
export class ShopRatingNotice extends BaseEntity {
  @Column('uuid')
  ratingId: string;
  @Column('uuid')
  shopId: string;
  @Column('integer')
  revision: number;
  @Column({ type: 'varchar', length: 32, default: 'BUYER_EDITED_RATING' })
  kind: string;
}
