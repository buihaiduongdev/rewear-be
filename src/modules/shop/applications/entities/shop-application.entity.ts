import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import { Shop } from '../../entities';
import {
  IDENTITY_RENEWAL_REASON,
  SHOP_APPLICATION_KIND,
} from '../constants/shop-application.constant';
import type {
  ShopApplicationKind,
  ShopApplicationSnapshot,
  ShopApplicationState,
} from '../schemas/shop-application.schema';

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
