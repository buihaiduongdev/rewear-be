import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';

import type { RatingMode } from '../schemas/rating.schema';

@Entity('shop_rating_media')
@Index(['buyerId', 'shopId'])
export class ShopRatingMedia extends BaseEntity {
  @Column('uuid')
  buyerId: string;
  @Column('uuid')
  shopId: string;
  @Column('uuid')
  orderId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: RatingMode;
  @Column('uuid', { unique: true })
  mediaId: string;
  @ManyToOne(() => Media, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'mediaId' })
  media: Media;
}
