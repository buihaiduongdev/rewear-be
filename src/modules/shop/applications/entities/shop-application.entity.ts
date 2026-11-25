import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';
import { User } from '@/modules/user/entities';

import { Shop } from '../../entities';
import {
  IDENTITY_RENEWAL_REASON,
  SHOP_APPLICATION_KIND,
} from '../constants/shop-application.constant';
import type {
  ApplicantIdentity,
  IdentityDocumentSlot,
  ShopApplicationKind,
  ShopApplicationSnapshot,
  ShopApplicationState,
} from '../types/shop-application.type';

@Entity('shop_applications')
@Index('UQ_initial_shop_application', ['shopId'], {
  unique: true,
  where: "kind='INITIAL'",
})
@Index('UQ_open_identity_renewal', ['shopId'], {
  unique: true,
  where: "kind='RENEWAL' AND state<>'APPROVED'",
})
@Index(['applicantId', 'createdAt'])
@Index(['state', 'submittedAt'])
@Check('CHK_shop_application_version', '"version" > 0 AND "revision" >= 0')
export class ShopApplication extends BaseEntity {
  @Column('varchar', { length: 16, default: SHOP_APPLICATION_KIND.INITIAL })
  kind: ShopApplicationKind;
  @Column('integer', { nullable: true })
  baseIdentityVersion: number | null;
  @Column('timestamptz', { nullable: true })
  firstCorrectionAt: Date | null;
  @Column('timestamptz', { nullable: true })
  correctionDueAt: Date | null;
  @Column('boolean', { default: false })
  timelySubmission: boolean;
  @Column('varchar', { length: 32, nullable: true })
  reasonCategory?:
    | (typeof IDENTITY_RENEWAL_REASON)[keyof typeof IDENTITY_RENEWAL_REASON]
    | null;
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
  @Column('integer', { nullable: true })
  firstSubmittedRevision: number | null;
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
  @Column({ type: 'varchar', length: 30, nullable: true })
  reasonCategory: string | null;
  @Column({ type: 'boolean', nullable: true })
  samePersonConfirmed: boolean | null;
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
