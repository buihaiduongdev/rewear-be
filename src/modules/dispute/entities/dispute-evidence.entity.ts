import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';
import { Order } from '@/modules/order/entities';

@Entity('dispute_evidence')
@Index(['orderId', 'uploadedById'])
@Index(['mediaId', 'orderId', 'uploadedById'], { unique: true })
export class DisputeEvidence extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  uploadedById: string;

  @Column('uuid')
  mediaId: string;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'mediaId' })
  media: Media;

  @Column('jsonb')
  tags: string[];

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  recordedAt: Date;

  get mimeType() {
    return this.media.mimeType;
  }
  get sizeBytes() {
    return this.media.sizeBytes;
  }
}
