import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { MediaOwnerType, MediaRole } from '../enums';
import { Media } from './media.entity';

@Entity('media_links')
@Check('CHK_media_links_sort_order_non_negative', '"sortOrder" >= 0')
@Index('IDX_media_links_owner_order', ['ownerType', 'ownerId', 'sortOrder'])
@Index('UQ_media_links_media_owner', ['mediaId', 'ownerType', 'ownerId'], {
  unique: true,
})
@Index('UQ_media_links_owner_cover', ['ownerType', 'ownerId'], {
  unique: true,
  where: '"role" = \'COVER\'',
})
export class MediaLink extends BaseEntity {
  @Column('uuid')
  mediaId: string;

  @ManyToOne(() => Media, (media) => media.links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mediaId' })
  media: Media;

  @Column({ type: 'enum', enum: MediaOwnerType })
  ownerType: MediaOwnerType;

  @Column('uuid')
  ownerId: string;

  @Column({ type: 'enum', enum: MediaRole })
  role: MediaRole;

  @Column({ type: 'integer' })
  sortOrder: number;
}
