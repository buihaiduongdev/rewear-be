import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import type { RatingMode } from '../schemas/rating.schema';

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
