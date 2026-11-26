import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('fee_policy_shop_acceptances')
@Index(['shopId', 'policyId'], { unique: true })
export class FeePolicyShopAcceptance extends BaseEntity {
  @Column('uuid')
  shopId: string;

  @Column('uuid')
  policyId: string;

  @Column('uuid')
  ownerId: string;

  @Column('timestamptz')
  acceptedAt: Date;
}
