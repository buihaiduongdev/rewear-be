import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import { Shop } from '../../entities';
import type {
  ApplicantIdentity,
  IdentityDocumentSlot,
  ShopApplicationSnapshot,
  ShopApplicationState,
} from '../types/shop-application.type';

@Entity('shop_applications')
@Index(['shopId'], { unique: true })
@Index(['applicantId', 'createdAt'])
@Index(['state', 'submittedAt'])
@Check('CHK_shop_application_version', '"version" > 0 AND "revision" >= 0')
export class ShopApplication extends BaseEntity {
  @Column('uuid')
  shopId: string;
  @ManyToOne(() => Shop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shopId' })
  shop: Shop;
  @Column('uuid')
  applicantId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicantId' })
  applicant: User;
  @Column('varchar', { length: 20 })
  state: ShopApplicationState;
  @Column('integer', { default: 1 })
  version: number;
  @Column('integer', { default: 0 })
  revision: number;
  @Column('jsonb', { nullable: true })
  snapshot: ShopApplicationSnapshot | null;
  @Column('varchar', { length: 64, nullable: true })
  snapshotFingerprint: string | null;
  @Column('timestamptz', { nullable: true })
  submittedAt: Date | null;
  @Column('text', { nullable: true })
  reason: string | null;
  @Column('text', { nullable: true })
  adminNote: string | null;
}
@Entity('shop_application_documents')
@Index(['applicationId'])
@Index(['uploadedById', 'createdAt'])
@Check('CHK_identity_document_size', '"sizeBytes" > 0')
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
  @Column('varchar', { length: 512 })
  storageKey: string;
  @Column('varchar', { length: 100 })
  mimeType: string;
  @Column('integer')
  sizeBytes: number;
  @Column('boolean', { default: false })
  ready: boolean;
  @Column('varchar', { length: 255, nullable: true })
  eTag: string | null;
  @Column('integer', { nullable: true })
  firstSubmittedRevision: number | null;
  @Column('timestamptz')
  uploadExpiresAt: Date;
}
@Entity('shop_application_revisions')
@Index(['applicationId', 'revision'], { unique: true })
export class ShopApplicationRevision extends BaseEntity {
  @Column('uuid')
  applicationId: string;
  @ManyToOne(() => ShopApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicationId' })
  application: ShopApplication;
  @Column('integer')
  revision: number;
  @Column('jsonb')
  snapshot: ShopApplicationSnapshot;
}
@Entity('shop_application_commands')
@Index(['actorId', 'requestId'], { unique: true })
export class ShopApplicationCommand extends BaseEntity {
  @Column('uuid')
  actorId: string;
  @Column('uuid')
  requestId: string;
  @Column('uuid')
  applicationId: string;
  @ManyToOne(() => ShopApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicationId' })
  application: ShopApplication;
  @Column('varchar', { length: 64 })
  fingerprint: string;
}
@Entity('shop_application_audits')
@Index(['applicationId', 'version'], { unique: true })
export class ShopApplicationAudit extends BaseEntity {
  @Column('uuid')
  applicationId: string;
  @ManyToOne(() => ShopApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicationId' })
  application: ShopApplication;
  @Column('uuid')
  actorId: string;
  @Column('varchar', { length: 24 })
  action: string;
  @Column('integer')
  version: number;
  @Column('integer')
  revision: number;
  @Column('text', { nullable: true })
  reason: string | null;
  @Column('text', { nullable: true })
  adminNote: string | null;
  @Column('text', { nullable: true })
  identityCheckEvidence: string | null;
}
@Entity('owner_identities')
@Index(['ownerId'], { unique: true })
export class OwnerIdentity extends BaseEntity {
  @Column('uuid')
  ownerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;
  @Column('uuid')
  applicationId: string;
  @Column('varchar', { length: 200 })
  normalizedName: string;
  @Column('date')
  birthDate: string;
}
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
