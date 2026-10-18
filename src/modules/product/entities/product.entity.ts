import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Category } from '@/modules/category/entities';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import { ProductCondition, ProductStatus } from '../enums';

@Entity('products')
@Check(
  'CHK_products_exactly_one_seller_source',
  '(("sellerUserId" IS NOT NULL)::int + ("shopId" IS NOT NULL)::int) = 1',
)
@Index('IDX_products_status_category_published', [
  'status',
  'categoryId',
  'publishedAt',
])
@Index('IDX_products_seller_status', ['sellerUserId', 'status'])
@Index('IDX_products_shop_status', ['shopId', 'status'])
export class Product extends BaseEntity {
  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column({ type: 'uuid', nullable: true })
  sellerUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sellerUserId' })
  seller: User | null;

  @Column({ type: 'uuid', nullable: true })
  shopId: string | null;

  @ManyToOne(() => Shop, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop | null;

  @Column({ length: 150 })
  title: string;

  @Column({ type: 'varchar', length: 5000, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ProductCondition })
  condition: ProductCondition;

  @Column({ type: 'varchar', length: 50, nullable: true })
  size: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  brand: string | null;

  @Column({ type: 'integer' })
  @Check('CHK_products_price_non_negative', '"price" >= 0')
  price: number;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  heldUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  soldAt: Date | null;
}
