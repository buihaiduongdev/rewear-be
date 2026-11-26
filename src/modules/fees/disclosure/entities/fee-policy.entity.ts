import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { FeePolicyPublishInput } from '../fee-disclosure.schema';

@Entity('fee_policies')
@Index(['version'], { unique: true })
export class FeePolicy extends BaseEntity {
  @Column('integer')
  version: number;

  @Column('timestamptz')
  publishedAt: Date;

  @Column('uuid')
  publishedBy: string;

  @Column('jsonb')
  conditions: FeePolicyPublishInput['conditions'];
}
