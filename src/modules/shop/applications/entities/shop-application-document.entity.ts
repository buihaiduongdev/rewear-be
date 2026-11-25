import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';

import type { IdentityDocumentSlot } from '../schemas/shop-application.schema';
import { ShopApplication } from './shop-application.entity';

@Entity('shop_application_documents')
@Index(['applicationId'])
@Index(['uploadedById', 'createdAt'])
export class ShopApplicationDocument extends BaseEntity {
  @Column('uuid')
  applicationId: string;

  @ManyToOne(() => ShopApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicationId' })
  application: ShopApplication;

  @Column('uuid')
  uploadedById: string;

  @Column('varchar', { length: 16 })
  slot: IdentityDocumentSlot;

  @Column('uuid', { unique: true })
  mediaId: string;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'mediaId' })
  media: Media;

  @Column('boolean', { default: false })
  isSelected: boolean;

  @Column('boolean', { default: false })
  isSubmitted: boolean;
}
