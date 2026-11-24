import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Shop } from '@/modules/shop/entities';

@Entity('pickup_locations')
@Index('UQ_pickup_locations_shop', ['shopId'], { unique: true })
@Index('UQ_pickup_locations_ghn_shop', ['ghnShopId'], {
  unique: true,
  where: '"ghnShopId" IS NOT NULL',
})
export class PickupLocation extends BaseEntity {
  @Column('uuid')
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  @Column({ type: 'integer', nullable: true })
  ghnShopId: number | null;

  @Column({ type: 'varchar', length: 20, default: 'NOT_CONNECTED' })
  ghnSyncStatus:
    'NOT_CONNECTED' | 'CREATING' | 'CONNECTED' | 'UNKNOWN' | 'STALE';

  @Column({ type: 'timestamptz', nullable: true })
  ghnSyncStartedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  ghnSyncAttempt: {
    name: string;
    phone: string;
    address: string;
    districtId: number;
    wardCode: string;
  } | null;

  @Column({ type: 'uuid', nullable: true })
  ghnReviewedById: string | null;

  @Column({ type: 'text', nullable: true })
  ghnReviewReason: string | null;

  @Column({ length: 100 })
  contactName: string;

  @Column({ length: 16 })
  phone: string;

  @Column({ length: 255 })
  addressLine1: string;

  @Column({ length: 2, default: 'VN' })
  countryCode: string;

  @Column({ type: 'integer' })
  provinceId: number;

  @Column({ length: 100 })
  provinceName: string;

  @Column({ type: 'integer' })
  districtId: number;

  @Column({ length: 100 })
  districtName: string;

  @Column({ length: 20 })
  wardCode: string;

  @Column({ length: 100 })
  wardName: string;
}
