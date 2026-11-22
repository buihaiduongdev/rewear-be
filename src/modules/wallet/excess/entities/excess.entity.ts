import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { User } from '@/modules/user/entities';

import { EXCESS_REVIEW } from '../constants/excess.constant';
import type {
  ExcessMethod,
  ExcessPaymentState,
  ExcessPaymentTarget,
  ExcessReview,
  ExcessSource,
} from '../types/excess.type';

@Entity('wallet_excess_cases')
@Index(['sourceType', 'sourceId'], { unique: true })
@Index(['buyerId', 'mode', 'verifiedAt'])
@Check(
  'CHK_excess_amounts',
  '"sourceAmount" > 0 AND "authorizedAmount" >= 0 AND "authorizedAmount" <= "sourceAmount" AND "version" > 0',
)
export class WalletExcess extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;
  @Column('integer', { default: 1 })
  decisionVersion: number;
  @Column('integer', { nullable: true })
  objectedDecisionVersion: number | null;
  @Column('text', { nullable: true })
  supplementRequest: string | null;
  @Column('uuid')
  buyerId: string;
  @Column('varchar', { length: 16 })
  mode: ReconciliationMode;
  @Column('varchar', { length: 24 })
  sourceType: ExcessSource;
  @Column('uuid')
  sourceId: string;
  @Column('integer')
  sourceAmount: number;
  @Column('integer')
  authorizedAmount: number;
  @Column('integer', { default: 1 })
  version: number;
  @Column('text')
  reason: string;
  @Column('text')
  evidence: string;
  @Column('timestamptz')
  verifiedAt: Date;
  @Column('timestamptz')
  objectionBy: Date;
  @Column('varchar', { length: 16, default: EXCESS_REVIEW.NONE })
  reviewState: ExcessReview;
  @Column('timestamptz', { nullable: true })
  objectedAt: Date | null;
  @Column('text', { nullable: true })
  objectionReason: string | null;
  @Column('text', { nullable: true })
  objectionEvidence: string | null;
  @Column('timestamptz', { nullable: true })
  reviewDueAt: Date | null;
  @Column('timestamptz', { nullable: true })
  reviewOverdueAt: Date | null;
  @Column('timestamptz', { nullable: true })
  responseDueAt: Date | null;
}
@Entity('wallet_excess_collections')
@Index(['excessId', 'method', 'sourceId'], { unique: true })
@Index(['buyerId', 'mode'])
@Check('CHK_excess_collection_positive', '"amount" > 0')
export class ExcessCollection extends BaseEntity {
  @ManyToOne(() => WalletExcess, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'excessId' })
  recovery: WalletExcess;
  @Column('uuid')
  excessId: string;
  @Column('uuid')
  buyerId: string;
  @Column('varchar', { length: 16 })
  mode: ReconciliationMode;
  @Column('varchar', { length: 16 })
  method: ExcessMethod;
  @Column('uuid')
  sourceId: string;
  @Column('integer')
  amount: number;
}
@Entity('wallet_excess_returns')
@Index(['collectionId'])
@Index(['buyerId', 'mode'])
@Check('CHK_excess_return_positive', '"amount" > 0')
export class ExcessReturn extends BaseEntity {
  @ManyToOne(() => ExcessCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collectionId' })
  collection: ExcessCollection;
  @Column('uuid')
  excessId: string;
  @Column('uuid')
  collectionId: string;
  @Column('uuid')
  buyerId: string;
  @Column('varchar', { length: 16 })
  mode: ReconciliationMode;
  @Column('varchar', { length: 16 })
  method: ExcessMethod;
  @Column('integer')
  amount: number;
  @Column('varchar', { length: 16 })
  state: ExcessPaymentState;
}
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
@Entity('wallet_excess_offset_sources')
@Index(['sourceType', 'sourceId'], { unique: true })
export class ExcessOffsetSource extends BaseEntity {
  @Column('varchar', { length: 24 })
  sourceType: ExcessSource;
  @Column('uuid')
  sourceId: string;
  @Column('integer')
  amount: number;
}
@Entity('wallet_excess_payments')
@Check('CHK_excess_payment_positive', '"amount" > 0')
@Index(['buyerId', 'requestId'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class ExcessPayment extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;
  @Column('uuid')
  buyerId: string;
  @Column('uuid')
  requestId: string;
  @Column('varchar', { length: 64 })
  fingerprint: string;
  @Column('jsonb')
  targets: ExcessPaymentTarget[];
  @Column('integer')
  amount: number;
  @Column('varchar', { length: 16 })
  state: ExcessPaymentState;
  @Column('text', { nullable: true })
  payUrl: string | null;
  @Column('timestamptz')
  nextQueryAt: Date;
}
@Entity('wallet_excess_captures')
@Check(
  'CHK_excess_capture_capacity',
  '"amount" > 0 AND "allocated" >= 0 AND "allocated" <= "amount"',
)
@Index(['providerTransId'], { unique: true })
export class ExcessCapture extends BaseEntity {
  @ManyToOne(() => ExcessPayment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment: ExcessPayment;
  @Column('uuid')
  paymentId: string;
  @Column('varchar', { length: 64 })
  providerTransId: string;
  @Column('integer')
  amount: number;
  @Column('integer', { default: 0 })
  allocated: number;
  @Column('jsonb', { default: [] })
  reservations: ExcessPaymentTarget[];
}
@Entity('wallet_excess_provider_refunds')
@Check('CHK_excess_provider_refund_positive', '"amount" > 0')
@Index(['returnId'], { unique: true })
@Index(['state', 'nextQueryAt'])
export class ExcessProviderRefund extends BaseEntity {
  @ManyToOne(() => ExcessCapture, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'captureId' })
  capture: ExcessCapture;
  @ManyToOne(() => ExcessReturn, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'returnId' })
  correctionReturn: ExcessReturn | null;
  @Column('uuid')
  captureId: string;
  @Column('uuid', { nullable: true })
  returnId: string | null;
  @Column('integer')
  amount: number;
  @Column('uuid')
  requestId: string;
  @Column('varchar', { length: 16 })
  state: ExcessPaymentState;
  @Column('timestamptz')
  nextQueryAt: Date;
  @Column('timestamptz', { nullable: true })
  alertedAt: Date | null;
  @Column('timestamptz', { nullable: true })
  responseDueAt: Date | null;
}
