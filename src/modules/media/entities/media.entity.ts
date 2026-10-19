import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import { MediaType } from '../enums';
import type { MediaLink } from './media-link.entity';

@Entity('media')
export class Media extends BaseEntity {
  @Column('uuid')
  uploadedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User;

  @Index({ unique: true })
  @Column({ length: 512 })
  storageKey: string;

  @Column({ length: 2048 })
  url: string;

  @Column({ type: 'enum', enum: MediaType })
  mediaType: MediaType;

  @Column({ length: 100 })
  mimeType: string;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @OneToMany('MediaLink', 'media')
  links: MediaLink[];
}
