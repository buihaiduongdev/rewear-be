import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { ShopBankAccount } from '@/modules/shop-finance/entities';
import { User } from '@/modules/user/entities';

import { Shop } from '../../entities';
import { SHOP_APPLICATION_KIND } from '../constants/shop-application.constant';
import type {
  IdentityDocumentType,
  ShopApplicationKind,
  ShopApplicationState,
} from '../schemas/shop-application.schema';
import { ShopApplicationDocument } from './shop-application-document.entity';

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

  @Column('varchar', { length: 16, default: SHOP_APPLICATION_KIND.INITIAL })
  kind: ShopApplicationKind;

  @Column('varchar', { length: 20 })
  state: ShopApplicationState;

  @Column('uuid', { nullable: true })
  bankAccountId: string | null;

  @ManyToOne(() => ShopBankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: ShopBankAccount | null;

  @OneToMany(() => ShopApplicationDocument, (doc) => doc.application)
  documents: ShopApplicationDocument[];

  @Column('varchar', { length: 20, nullable: true })
  documentType: IdentityDocumentType | null;

  @Column('varchar', { length: 20, nullable: true })
  documentNumber: string | null;

  @Column('varchar', { length: 2, nullable: true })
  issuingCountry: string | null;

  @Column('varchar', { length: 200, nullable: true })
  fullName: string | null;

  @Column('date', { nullable: true })
  birthDate: string | null;

  @Column('date', { nullable: true })
  expiresOn: string | null;

  @Column('timestamptz', { nullable: true })
  submittedAt: Date | null;

  @Column('uuid', { nullable: true })
  reviewedById: string | null;

  @Column('timestamptz', { nullable: true })
  reviewedAt: Date | null;

  @Column('text', { nullable: true })
  reason: string | null;

  @Column('text', { nullable: true })
  adminNote: string | null;
}
