import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { CoinReleaseCause } from '../schemas/coin.schema';

@Entity('coin_cod_release_audits')
@Index(['orderId', 'requestId'], { unique: true })
export class CoinCodReleaseAudit extends BaseEntity {
  @Column('uuid')
  orderId: string;
  @Column('uuid')
  requestId: string;
  @Column('uuid')
  actorId: string;
  @Column('varchar')
  cause: CoinReleaseCause;
  @Column('text')
  evidence: string;
  @Column('timestamptz')
  verifiedAt: Date;
}
