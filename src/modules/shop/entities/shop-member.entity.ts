import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import { ShopMemberRole } from '../enums';
import { Shop } from './shop.entity';

@Entity('shop_members')
@Index('UQ_shop_members_user', ['userId'], { unique: true })
@Index('UQ_shop_members_owner', ['shopId'], {
  unique: true,
  where: '"memberRole" = \'OWNER\'',
})
export class ShopMember extends BaseEntity {
  @Column('uuid')
  shopId: string;

  @ManyToOne(() => Shop, (shop) => shop.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: ShopMemberRole })
  memberRole: ShopMemberRole;

  @CreateDateColumn()
  joinedAt: Date;
}
