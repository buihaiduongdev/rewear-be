import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import type { RatingMode } from '../types/rating.type';

@Entity('shop_ratings')
@Index(['buyerId', 'shopId'], { unique: true })
@Index(['shopId', 'mode', 'invalidated', 'updatedAt'])
@Check('"stars" BETWEEN 1 AND 5')
export class ShopRating extends BaseEntity {
  @Column('uuid')
  buyerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;
  @Column('uuid')
  shopId: string;
  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;
  @Column('uuid')
  orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
  @Column('uuid')
  deliveryVerificationId: string;
  @ManyToOne(() => OrderDeliveryVerification, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'deliveryVerificationId' })
  deliveryVerification: OrderDeliveryVerification;
  @Column({ type: 'varchar', length: 16 })
  mode: RatingMode;
  @Column('integer')
  stars: number;
  @Column({ type: 'text', nullable: true })
  comment: string | null;
  @Column({ type: 'jsonb', default: [] })
  mediaIds: string[];
  @Column({ default: false })
  commentHidden: boolean;
  @Column({ default: false })
  mediaHidden: boolean;
  @Column({ default: false })
  replyHidden: boolean;
  @Column({ default: false })
  invalidated: boolean;
  @Column({ default: 1 })
  revision: number;
  @Column({ type: 'text', nullable: true })
  reply: string | null;
  @Column({ default: 0 })
  replyRevision: number;
}

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

@Entity('shop_rating_moderation_audits')
export class ShopRatingModerationAudit extends BaseEntity {
  @Column('uuid')
  ratingId: string;
  @Column('uuid')
  actorId: string;
  @Column('jsonb')
  decision: Record<string, unknown>;
  @Column('integer')
  buyerRevision: number;
  @Column('integer')
  replyRevision: number;
}

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
