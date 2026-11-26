import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('fee_payment_captures')
@Index(['providerTransId'], { unique: true })
export class FeePaymentCapture extends BaseEntity {
  @Column('uuid')
  paymentId: string;

  @Column('varchar')
  providerTransId: string;

  @Column('integer')
  amount: number;

  @Column('integer')
  allocatedAmount: number;
}
