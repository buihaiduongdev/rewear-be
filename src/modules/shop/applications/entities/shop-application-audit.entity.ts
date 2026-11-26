import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { ShopApplication } from './shop-application.entity';

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
