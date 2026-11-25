import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import type { IdentityDocumentType } from '../schemas/shop-application.schema';

@Entity('owner_identities')
@Index('UQ_owner_identity_owner', ['ownerId'], { unique: true })
@Index(
  'UQ_owner_identity_document',
  ['documentType', 'issuingCountry', 'documentNumber'],
  { unique: true },
)
export class OwnerIdentity extends BaseEntity {
  @Column('uuid')
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column('varchar', { length: 20 })
  documentType: IdentityDocumentType;

  @Column('varchar', { length: 2 })
  issuingCountry: string;

  @Column('varchar', { length: 20 })
  documentNumber: string;
}
