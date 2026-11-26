import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { WalletExcess } from './wallet-excess.entity';

@Entity('wallet_excess_commands')
@Index(['actorId', 'requestId'], { unique: true })
export class ExcessCommand extends BaseEntity {
  @ManyToOne(() => WalletExcess, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'excessId' })
  recovery: WalletExcess;

  @Column('uuid')
  actorId: string;

  @Column('uuid')
  requestId: string;

  @Column('uuid')
  excessId: string;

  @Column('varchar', { length: 64 })
  fingerprint: string;
}
