import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Product } from '@/modules/product/entities';

import { MediaRole } from '../enums';
import { Media } from './media.entity';

@Entity('product_media')
@Check('CHK_product_media_sort_order_non_negative', '"sortOrder" >= 0')
@Index('IDX_product_media_order', ['productId', 'sortOrder'])
@Index('UQ_product_media_product_media', ['productId', 'mediaId'], {
  unique: true,
})
@Index('UQ_product_media_cover', ['productId'], {
  unique: true,
  where: '"role" = \'COVER\'',
})
export class ProductMedia extends BaseEntity {
  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column('uuid')
  mediaId: string;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mediaId' })
  media: Media;

  @Column({ type: 'enum', enum: MediaRole })
  role: MediaRole;

  @Column({ type: 'varchar', length: 30, nullable: true })
  angle: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;
}
