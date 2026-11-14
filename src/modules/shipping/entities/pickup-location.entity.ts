import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Shop } from '@/modules/shop/entities';

@Entity('pickup_locations')
@Index('UQ_pickup_locations_shop', ['shopId'], { unique: true })
export class PickupLocation extends BaseEntity {
  @Column('uuid')
  shopId: string;

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
