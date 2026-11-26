import { Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { OUTBOX_EVENT_STATUSES } from './constants/event-status.constant';
import { OutboxEvent } from './entities/outbox-event.entity';
import type { TRecordOutboxEventInput } from './types/outbox-event.type';

@Injectable()
export class OutboxService {
  record(manager: EntityManager, input: TRecordOutboxEventInput) {
    return manager.insert(OutboxEvent, {
      eventType: input.eventType,
      resourceId: input.resourceId,
      payload: input.payload as QueryDeepPartialEntity<Record<string, unknown>>,
      status: OUTBOX_EVENT_STATUSES.PENDING,
    });
  }
}
