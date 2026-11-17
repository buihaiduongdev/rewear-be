import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Shop } from '@/modules/shop/entities';

import { ShopRolePermission } from './shop-role-permission.entity';

@Entity('shop_roles')
@Index('UQ_shop_roles_shop_id_name', ['shopId', 'name'], { unique: true })
export class ShopRole extends BaseEntity {
  @Column('uuid')
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ default: false })
  isDefault: boolean;

  @OneToMany(() => ShopRolePermission, (permission) => permission.role, {
    cascade: true,
  })
  permissions: ShopRolePermission[];
}
