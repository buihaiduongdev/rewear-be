import { Column, Entity, OneToMany } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { ShopStatus } from '../enums';
import { ShopMember } from './shop-member.entity';

@Entity('shops')
export class Shop extends BaseEntity {
  @Column({ default: false })
  onboardingRequired: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;
  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'enum', enum: ShopStatus, default: ShopStatus.ACTIVE })
  status: ShopStatus;

  @OneToMany(() => ShopMember, (member) => member.shop)
  members: ShopMember[];
}
