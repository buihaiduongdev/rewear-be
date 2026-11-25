import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { WalletExcess } from './wallet-excess.entity';

@Entity('wallet_excess_audits')
@Index(['excessId', 'createdAt'])
export class ExcessAudit extends BaseEntity {
  @ManyToOne(() => WalletExcess, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'excessId' })
  recovery: WalletExcess;

  @Column('uuid')
  excessId: string;

  @Column('uuid', { nullable: true })
  actorId: string | null;

  @Column('varchar', { length: 32 })
  action: string;

  @Column('text')
  reason: string;

  @Column('jsonb', { default: {} })
  detail: Record<string, unknown>;
}
