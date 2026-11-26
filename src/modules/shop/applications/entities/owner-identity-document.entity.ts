import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ApplicantIdentity } from '../schemas/shop-application.schema';
import { OwnerIdentity } from './owner-identity.entity';

@Entity('owner_identity_documents')
@Index(['fingerprint'], { unique: true })
export class OwnerIdentityDocument extends BaseEntity {
  @Column('uuid')
  identityId: string;
  @ManyToOne(() => OwnerIdentity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'identityId' })
  identity: OwnerIdentity;
  @Column('varchar', { length: 64 })
  fingerprint: string;
  @Column('jsonb')
  document: ApplicantIdentity;
}
