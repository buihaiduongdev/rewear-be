import { Column, Entity, Unique } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('event_deliveries')
@Unique('UQ_event_deliveries_event_consumer', ['eventId', 'consumerName'])
export class EventDelivery extends BaseEntity {
  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'consumer_name', type: 'varchar', length: 100 })
  consumerName: string;
}
