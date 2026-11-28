import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { PaymentOrderSnapshot } from '@/modules/payment/schemas/payment.schema';
import { User } from '@/modules/user/entities';

import { WALLET_HOLD_STATE } from '../constants/wallet.constant';
import type { WalletHoldState } from '../schemas/wallet.schema';

@Entity('wallet_checkout_holds')
@Index(['checkoutId', 'state'])
@Index('UQ_wallet_active_checkout', ['checkoutId'], {
  unique: true,
  where: `"state" = '${WALLET_HOLD_STATE.HELD}'`,
})
@Check('CHK_wallet_hold_amount', '"amount" > 0')
@Check(
  'CHK_wallet_hold_mode',
  `"mode" IN ('${RECONCILIATION_MODE.EVIDENCE}','${RECONCILIATION_MODE.SIMULATION}')`,
)
@Check(
  'CHK_wallet_hold_state',
  `("state"='${WALLET_HOLD_STATE.HELD}' AND "capturedAt" IS NULL AND "releasedAt" IS NULL) OR ("state"='${WALLET_HOLD_STATE.CAPTURED}' AND "capturedAt" IS NOT NULL AND "releasedAt" IS NULL) OR ("state" IN ('${WALLET_HOLD_STATE.RELEASED}','${WALLET_HOLD_STATE.EXPIRED}') AND "capturedAt" IS NULL AND "releasedAt" IS NOT NULL)`,
)
export class WalletCheckoutHold extends BaseEntity {
  @Column('uuid')
  checkoutId: string;

  @ManyToOne(() => Checkout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkoutId' })
  checkout: Checkout;

  @Column('uuid')
  buyerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column({ type: 'varchar', length: 16 })
  state: WalletHoldState;

  @Column('integer')
  amount: number;

  @Column('jsonb')
  orders: PaymentOrderSnapshot[];

  @Column('timestamptz')
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;
}
