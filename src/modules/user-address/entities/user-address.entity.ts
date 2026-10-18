import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

@Entity('user_addresses')
@Index('IDX_user_addresses_user_id', ['userId'])
@Index('UQ_user_addresses_default_per_user', ['userId'], {
  unique: true,
  where: '"isDefault" = true',
})
export class UserAddress extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ length: 100 })
  recipientName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  label: string | null;

  @Column({ length: 16 })
  phone: string;

  @Column({ length: 255 })
  addressLine1: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  addressLine2: string | null;

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

  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deliveryInstructions: string | null;

  @Column({ default: false })
  isDefault: boolean;
}
