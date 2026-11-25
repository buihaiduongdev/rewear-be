import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import type { IdentityDocumentType } from '../schemas/shop-application.schema';
import { ShopApplication } from './shop-application.entity';

@Entity('owner_identities')
@Index('UQ_owner_identity_owner', ['ownerId'], { unique: true })
@Index(
  'UQ_owner_identity_document',
  ['documentType', 'issuingCountry', 'documentNumber'],
  { unique: true },
)
@Index(['normalizedName', 'birthDate'])
export class OwnerIdentity extends BaseEntity {
  @Column('uuid')
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column('uuid')
  applicationId: string;

  @ManyToOne(() => ShopApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicationId' })
  application: ShopApplication;

  @Column('varchar', { length: 20 })
  documentType: IdentityDocumentType;

  @Column('varchar', { length: 2 })
  issuingCountry: string;

  @Column('varchar', { length: 20 })
  documentNumber: string;

  @Column('varchar', { length: 200 })
  fullName: string;

  @Column('varchar', { length: 200 })
  normalizedName: string;

  @Column('date')
  birthDate: string;

  @Column('date')
  expiresOn: string;
}
