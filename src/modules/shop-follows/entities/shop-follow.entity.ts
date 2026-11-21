import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

@Entity('shop_follows')
@Index(['userId', 'shopId'], { unique: true })
@Index(['userId', 'createdAt', 'id'])
export class ShopFollow extends BaseEntity {
  @Column('uuid')
  userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column('uuid')
  shopId: string;
  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;
}
