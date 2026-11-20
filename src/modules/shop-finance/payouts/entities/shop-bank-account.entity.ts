import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('shop_bank_accounts')
@Index('UQ_shop_bank_default', ['shopId'], {
  unique: true,
  where: '"isDefault" = true AND "deletedAt" IS NULL',
})
export class ShopBankAccount extends BaseEntity {
  @Column('uuid')
  shopId: string;
  @Column({ type: 'varchar', length: 40 })
  bankCode: string;
  @Column({ type: 'varchar', length: 40 })
  accountNumber: string;
  @Column({ type: 'varchar', length: 150 })
  accountName: string;
  @Column('uuid')
  confirmedBy: string;
  @Column('timestamptz')
  confirmedAt: Date;
  @Column({ default: false })
  isDefault: boolean;
  @Column({ type: 'varchar', length: 20, default: 'UNVERIFIED' })
  verificationStatus: 'UNVERIFIED' | 'MANUALLY_VERIFIED';
  @Column({ type: 'text', nullable: true })
  verificationEvidence: string | null;
  @Column({ type: 'text', nullable: true })
  riskReason: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
