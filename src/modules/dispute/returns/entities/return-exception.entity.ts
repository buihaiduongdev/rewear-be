import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { DisputeFinalDecision } from '../../entities/dispute-appeal.entity';
import { DisputeEvidence } from '../../entities/dispute.entity';
import { DisputeReturn } from './dispute-return.entity';

@Entity('dispute_safety_waivers')
@Index(['finalDecisionId'], { unique: true })
export class DisputeSafetyWaiver extends BaseEntity {
  @Column('uuid')
  finalDecisionId: string;
  @ManyToOne(() => DisputeFinalDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'finalDecisionId' })
  final: DisputeFinalDecision;
  @Column('uuid')
  orderId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column({ type: 'varchar', length: 32 })
  basis: 'UNSAFE' | 'NON_TRANSPORTABLE';
  @Column('text')
  reason: string;
  @Column('text')
  instructions: string;
  @Column('uuid')
  verifiedBy: string;
  @Column('jsonb')
  basisEvidenceIds: string[];
  @Column({ type: 'jsonb', nullable: true })
  executionEvidenceIds: string[] | null;
  @Column({ type: 'text', nullable: true })
  executionStatement: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  fulfilledAt: Date | null;
  @Column({ type: 'uuid', nullable: true })
  fulfilledBy: string | null;
}

@Entity('dispute_return_exceptions')
@Index(['finalDecisionId', 'direction'], { unique: true })
@Index(['remedyKey', 'direction'], { unique: true })
export class DisputeReturnException extends BaseEntity {
  @Column('uuid')
  finalDecisionId: string;
  @ManyToOne(() => DisputeFinalDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'finalDecisionId' })
  final: DisputeFinalDecision;
  @Column('uuid')
  orderId: string;
  @Column('uuid')
  shopId: string;
  @Column({ length: 73 })
  remedyKey: string;
  @Column({ type: 'uuid', nullable: true })
  returnId: string | null;
  @ManyToOne(() => DisputeReturn, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'returnId' })
  returnCase: DisputeReturn | null;
  @Column({ type: 'varchar', length: 16 })
  direction: 'OUTBOUND' | 'RETURN';
  @Column({ type: 'varchar', length: 32 })
  kind: 'CARRIER_LOSS' | 'CARRIER_DAMAGE' | 'SELLER_REFUSAL';
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column({ length: 50 })
  waybillCode: string;
  @Column('text')
  reason: string;
  @Column('text')
  dispositionInstructions: string;
  @Column('jsonb')
  evidenceIds: string[];
  @Column('uuid')
  verifiedBy: string;
  @Column('timestamptz')
  occurredAt: Date;
}

@Entity('carrier_compensation_acknowledgements')
@Index(['exceptionId'], { unique: true })
@Check('CHK_carrier_ack_amount', '"amount" > 0')
export class CarrierCompensationAcknowledgement extends BaseEntity {
  @Column('uuid')
  exceptionId: string;
  @ManyToOne(() => DisputeReturnException, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'exceptionId' })
  exception: DisputeReturnException;
  @Column('integer')
  amount: number;
  @Column('text')
  conditions: string;
  @Column('text')
  evidence: string;
  @Column('uuid')
  actorId: string;
}

@Entity('carrier_compensation_receipts')
@Index(['mode', 'reference'], { unique: true })
@Check('CHK_carrier_receipt_amount', '"amount" > 0')
export class CarrierCompensationReceipt extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  chargeId: string | null;

  @Column('uuid')
  exceptionId: string;
  @ManyToOne(() => DisputeReturnException, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'exceptionId' })
  exception: DisputeReturnException;
  @Column('uuid')
  shopId: string;
  @Column('uuid')
  orderId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column({ length: 120 })
  reference: string;
  @Column({ type: 'varchar', length: 24 })
  kind: 'CASH' | 'VERIFIED_NETTING';
  @Column('integer')
  amount: number;
  @Column('timestamptz')
  receivedAt: Date;
  @Column('text')
  evidence: string;
  @Column('uuid')
  actorId: string;
}

@Entity('dispute_return_shipping_charges')
@Index(['returnId', 'kind'], { unique: true })
@Index(['mode', 'invoiceReference'], { unique: true })
@Check('CHK_return_shipping_charge_positive', '"amount" > 0')
export class ReturnShippingCharge extends BaseEntity {
  @Column({ type: 'varchar', length: 50, nullable: true })
  waybillCode: string | null;
  @Column('uuid')
  returnId: string;
  @ManyToOne(() => DisputeReturn, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'returnId' })
  returnCase: DisputeReturn;
  @Column('uuid')
  orderId: string;
  @Column('uuid')
  shopId: string;
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;
  @Column({ type: 'varchar', length: 24 })
  kind: 'STANDARD' | 'REFUSAL_EXTRA';
  @Column('integer')
  amount: number;
  @Column({ length: 120 })
  invoiceReference: string;
  @Column('text')
  evidence: string;
  @Column('text')
  reason: string;
  @Column('uuid')
  actorId: string;
}

@Entity('dispute_remedy_evidence_links')
@Index(['recordId', 'evidenceId'], { unique: true })
export class DisputeRemedyEvidenceLink extends BaseEntity {
  @Column('uuid')
  recordId: string;
  @Column('uuid')
  orderId: string;
  @Column('uuid')
  evidenceId: string;
  @ManyToOne(() => DisputeEvidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: DisputeEvidence;
}

@Entity('dispute_remedy_events')
@Index(['requestId'], { unique: true })
export class DisputeRemedyEvent extends BaseEntity {
  @Column('uuid')
  requestId: string;
  @Column('uuid')
  finalDecisionId: string;
  @Column('uuid')
  actorId: string;
  @Column({ length: 64 })
  action: string;
  @Column({ length: 64 })
  fingerprint: string;
  @Column({ type: 'uuid', nullable: true })
  recordId: string | null;
}
