import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { ShopRole } from './shop-role.entity';

@Entity('shop_role_permissions')
export class ShopRolePermission {
  @PrimaryColumn('uuid')
  roleId: string;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  permissionKey: string;

  @ManyToOne(() => ShopRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role: ShopRole;
}
