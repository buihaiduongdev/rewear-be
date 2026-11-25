import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import { MediaType } from '../enums';

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

  @Column({ type: 'varchar', length: 7, default: 'public' })
  visibility: 'public' | 'private';

  @Column({ type: 'enum', enum: MediaType })
  mediaType: MediaType;

  @Column({ length: 100 })
  mimeType: string;

  @Column({ type: 'timestamptz', nullable: true })
  retiredAt: Date | null;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @Column({ default: true })
  isAttached: boolean;
}
