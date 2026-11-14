import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { ProductModerationStatus } from '../enums';
import { Product } from './product.entity';

@Entity('product_moderations')
export class ProductModeration extends BaseEntity {
  @Column('uuid')
  productId: string;

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'varchar', length: 20 })
  status: ProductModerationStatus;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;
}
