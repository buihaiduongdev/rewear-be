import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Media } from '@/modules/media/entities';
import { Order } from '@/modules/order/entities/order.entity';
import type { OrderState } from '@/modules/order/types/order.type';

import type {
  DisputeAction,
  DisputeCaseState,
  DisputeIssueState,
  DisputeKind,
  DisputeNoticeAudience,
  DisputeParty,
} from '../types/dispute.type';

@Entity('dispute_cases')
@Index(['orderId'], { unique: true })
@Index(['shopId', 'createdAt'])
export class DisputeCase extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  buyerId: string;

  @Column('uuid')
  shopId: string;

  @Column({ type: 'varchar', length: 24 })
  previousOrderStatus: OrderState;

  @Column({ type: 'varchar', length: 16 })
  state: DisputeCaseState;
}

@Entity('dispute_issues')
@Index(['caseId', 'productId', 'kind'], { unique: true })
@Index(['status', 'supplementBy'])
export class DisputeIssue extends BaseEntity {
  @Column('uuid')
  caseId: string;

  @ManyToOne(() => DisputeCase, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'caseId' })
  case: DisputeCase;

  @Column('uuid')
  productId: string;

  @Column({ type: 'varchar', length: 24 })
  kind: DisputeKind;

  @Column('text')
  description: string;

  @Column({ type: 'varchar', length: 24 })
  status: DisputeIssueState;

  @Column('timestamptz')
  supplementBy: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sellerNotifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sellerRespondBy: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  maxReviewDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  extendedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  extensionReason: string | null;

  @Column({ default: false })
  calendarMissing: boolean;

  @Column({ default: false })
  reviewOverdue: boolean;

  @Column({ default: false })
  sellerResponseOverdue: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  escalatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  escalationDueAt: Date | null;
}

@Entity('dispute_evidence')
@Index(['orderId', 'uploadedById'])
@Index(['mediaId', 'orderId', 'uploadedById'], { unique: true })
export class DisputeEvidence extends BaseEntity {
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('uuid')
  uploadedById: string;

  @Column('uuid')
  mediaId: string;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'mediaId' })
  media: Media;

  @Column('jsonb')
  tags: string[];

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  recordedAt: Date;

  get mimeType() {
    return this.media.mimeType;
  }
  get sizeBytes() {
    return this.media.sizeBytes;
  }
}

@Entity('dispute_attachments')
@Index(['issueId', 'evidenceId'], { unique: true })
export class DisputeAttachment extends BaseEntity {
  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column('uuid')
  evidenceId: string;

  @ManyToOne(() => DisputeEvidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: DisputeEvidence;
}

@Entity('dispute_messages')
@Index(['issueId', 'requestId'], { unique: true })
export class DisputeMessage extends BaseEntity {
  @Column('text')
  text: string;

  @Column('jsonb')
  evidenceIds: string[];

  @Column({ type: 'boolean', nullable: true })
  late: boolean | null;

  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column('uuid')
  requestId: string;

  @Column('uuid')
  actorId: string;

  @Column({ type: 'varchar', length: 16 })
  party: DisputeParty;
}

@Entity('dispute_notices')
@Index(['issueId', 'action', 'audience', 'eventKey'], { unique: true })
export class DisputeNotice extends BaseEntity {
  @Column({ type: 'varchar', length: 64, default: 'INITIAL' })
  eventKey: string;

  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column({ type: 'varchar', length: 24 })
  action: DisputeAction;

  @Column({ type: 'varchar', length: 16 })
  audience: DisputeNoticeAudience;

  @Column('text')
  reason: string;
}

@Entity('dispute_audits')
@Index(['issueId', 'createdAt'])
export class DisputeAudit extends BaseEntity {
  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column({ type: 'varchar', length: 24 })
  action: DisputeAction;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;
}
