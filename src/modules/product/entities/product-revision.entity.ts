import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { Product } from './product.entity';

export type RevisionDecision =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

@Entity('product_revisions')
@Index(['productId', 'revision'], { unique: true })
export class ProductRevision extends BaseEntity {
  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column('integer')
  revision: number;

  @Column('jsonb')
  snapshot: Record<string, unknown>;

  @Column('uuid')
  submittedById: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  decision: RevisionDecision;

  @Column({ type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
