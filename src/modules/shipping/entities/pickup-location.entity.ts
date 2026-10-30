import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

@Entity('pickup_locations')
@Check(
  'CHK_pickup_locations_source',
  '("userId" IS NOT NULL AND "shopId" IS NULL) OR ("userId" IS NULL AND "shopId" IS NOT NULL)',
)
@Index('UQ_pickup_locations_user', ['userId'], { unique: true })
@Index('UQ_pickup_locations_shop', ['shopId'], { unique: true })
export class PickupLocation extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  shopId: string | null;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  @Column({ length: 100 })
  contactName: string;

  @Column({ length: 16 })
  phone: string;

  @Column({ length: 255 })
  addressLine1: string;

  @Column({ length: 2, default: 'VN' })
  countryCode: string;

  @Column({ length: 20 })
  provinceCode: string;

  @Column({ length: 100 })
  provinceName: string;

  @Column({ length: 20 })
  wardCode: string;

  @Column({ length: 100 })
  wardName: string;
}
