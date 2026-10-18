import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ length: 120, unique: true })
  slug: string;

  @Column({ default: true })
  isActive: boolean;
}
