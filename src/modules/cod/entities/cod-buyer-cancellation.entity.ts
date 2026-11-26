import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('cod_buyer_cancellations')
@Index(['buyerId', 'checkoutId'], { unique: true })
@Index(['buyerId', 'createdAt'])
export class CodBuyerCancellation extends BaseEntity {
  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  checkoutId: string;
}
