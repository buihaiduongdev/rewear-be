import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { FeeAssessment } from '@/modules/fees/entities';
import { User } from '@/modules/user/entities';

@Entity('fee_wallet_debits')
@Index(['buyerId', 'requestId'], { unique: true })
@Check('CHK_fee_wallet_debit_positive', 'amount > 0')
@Check('CHK_fee_wallet_mode', `mode IN ('EVIDENCE','SIMULATION')`)
export class FeeWalletDebit extends BaseEntity {
  @Column('uuid')
  feeId: string;

  @ManyToOne(() => FeeAssessment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feeId' })
  fee: FeeAssessment;

  @Column('uuid')
  buyerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @Column('uuid')
  requestId: string;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column('integer')
  amount: number;
}
