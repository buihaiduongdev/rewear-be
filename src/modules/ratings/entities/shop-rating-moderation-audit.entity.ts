import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('shop_rating_moderation_audits')
export class ShopRatingModerationAudit extends BaseEntity {
  @Column('uuid')
  ratingId: string;
  @Column('uuid')
  actorId: string;
  @Column('jsonb')
  decision: Record<string, unknown>;
  @Column('integer')
  buyerRevision: number;
  @Column('integer')
  replyRevision: number;
}
