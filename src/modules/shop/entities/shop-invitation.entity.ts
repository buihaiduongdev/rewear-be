import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import { ShopInvitationStatus } from '../enums/shop-invitation-status.enum';

@Entity('shop_invitations')
export class ShopInvitation extends BaseEntity {
  @Column('uuid')
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid', { array: true, default: '{}' })
  roleIds: string[];

  @Column({ type: 'varchar', default: ShopInvitationStatus.PENDING })
  status: ShopInvitationStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
