import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { ShopRating } from './shop-rating.entity';

@Entity('shop_rating_versions')
@Index(['ratingId', 'kind', 'revision'], { unique: true })
export class ShopRatingVersion extends BaseEntity {
  @Column('uuid')
  ratingId: string;
  @ManyToOne(() => ShopRating, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ratingId' })
  rating: ShopRating;
  @Column('uuid')
  actorId: string;
  @Column({ type: 'varchar', length: 16 })
  kind: 'BUYER' | 'REPLY';
  @Column('integer')
  revision: number;
  @Column('jsonb')
  snapshot: Record<string, unknown>;
}
