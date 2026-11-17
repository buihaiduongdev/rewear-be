import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { ShopMember } from '@/modules/shop/entities';

import { ShopRole } from './shop-role.entity';

@Entity('shop_member_roles')
export class ShopMemberRoleAssignment {
  @PrimaryColumn('uuid')
  memberId: string;

  @PrimaryColumn('uuid')
  roleId: string;

  @ManyToOne(() => ShopMember, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memberId' })
  member: ShopMember;

  @ManyToOne(() => ShopRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role: ShopRole;
}
