import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import {
  OUTBOX_EVENT_STATUSES,
  type TOutboxEventStatus,
} from '../constants/event-status.constant';

@Entity('outbox_events')
@Index('IDX_outbox_events_status_created_at', ['status', 'createdAt'])
export class OutboxEvent extends BaseEntity {
  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 30,
    default: OUTBOX_EVENT_STATUSES.PENDING,
  })
  status: TOutboxEventStatus;
}
