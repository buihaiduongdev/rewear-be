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

import { ShopMemberRole, ShopMemberStatus } from '../enums';
import { Shop } from './shop.entity';

@Entity('shop_members')
@Index('UQ_shop_members_shop_user', ['shopId', 'userId'], { unique: true })
@Index('IDX_shop_members_user_id', ['userId'])
@Index('UQ_shop_members_active_owner', ['shopId'], {
  unique: true,
  where: '"memberRole" = \'OWNER\' AND "status" = \'ACTIVE\'',
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

  @Column({
    type: 'enum',
    enum: ShopMemberStatus,
    default: ShopMemberStatus.ACTIVE,
  })
  status: ShopMemberStatus;

  @CreateDateColumn()
  joinedAt: Date;
}
