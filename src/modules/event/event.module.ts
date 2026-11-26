import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { QUEUE_NAMES } from '@/infrastructure/queue/queue.constants';

import { EventDelivery } from './entities/event-delivery.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxPublisherService } from './outbox-publisher.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent, EventDelivery]),
    BullModule.registerQueue({ name: QUEUE_NAMES.DOMAIN_EVENTS }),
  ],
  providers: [OutboxService, OutboxPublisherService],
  exports: [OutboxService, OutboxPublisherService, TypeOrmModule],
})
export class EventModule {}
