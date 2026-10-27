import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Category } from '@/modules/category/entities';
import type { MediaLink } from '@/modules/media/entities';
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
  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;

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

  @Column({ type: 'varchar', length: 150, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 5000, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ProductCondition, nullable: true })
  condition: ProductCondition | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  size: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  brand: string | null;

  @Column({ type: 'integer', nullable: true })
  @Check('CHK_products_price_non_negative', '"price" >= 0')
  price: number | null;

  @Column({ type: 'jsonb', default: {} })
  measurements: Record<string, number>;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  repairs: string | null;

  @Column({ type: 'jsonb', default: [] })
  defects: { description: string; mediaIds: string[] }[];

  @Column({ type: 'integer', default: 1 })
  revision: number;

  @Column({ type: 'integer', nullable: true })
  approvedRevision: number | null;

  // Loaded in bulk by ProductService; never exposed as raw storage metadata.
  mediaLinks?: MediaLink[];

  get coverUrl(): string | null {
    return (
      this.mediaLinks?.find((link) => link.role === 'COVER')?.media.url ?? null
    );
  }

  get mediaCount(): number {
    return this.mediaLinks?.length ?? 0;
  }

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  heldUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  soldAt: Date | null;
}
