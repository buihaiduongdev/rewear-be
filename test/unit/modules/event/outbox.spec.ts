import { randomUUID } from 'node:crypto';

import type { Queue } from 'bullmq';
import type { DataSource, EntityManager } from 'typeorm';

import { OUTBOX_EVENT_STATUSES } from '@/modules/event/constants/event-status.constant';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxEvent } from '@/modules/event/entities/outbox-event.entity';
import { OutboxPublisherService } from '@/modules/event/outbox-publisher.service';
import { OutboxService } from '@/modules/event/outbox.service';

describe('OutboxService & OutboxPublisherService', () => {
  it('records pending outbox event via manager.insert', async () => {
    const insert = jest.fn(async () => ({ identifiers: [{ id: '1' }] }));
    const manager = { insert } as unknown as EntityManager;
    const service = new OutboxService();

    const orderId = randomUUID();
    const buyerId = randomUUID();
    const shopId = randomUUID();

    await service.record(manager, {
      eventType: EVENT_TYPES.ORDER_CREATED,
      resourceId: orderId,
      payload: { orderId, buyerId, shopId },
    });

    expect(insert).toHaveBeenCalledWith(OutboxEvent, {
      eventType: EVENT_TYPES.ORDER_CREATED,
      resourceId: orderId,
      payload: { orderId, buyerId, shopId },
      status: OUTBOX_EVENT_STATUSES.PENDING,
    });
  });

  it('publishes pending events in bulk and skips overlapping cron runs', async () => {
    const eventId = randomUUID();
    const resourceId = randomUUID();
    const getMany = jest.fn(async () => [
      {
        id: eventId,
        eventType: EVENT_TYPES.SHOP_INVITATION_CREATED,
        resourceId,
        payload: {
          invitationId: resourceId,
          shopId: randomUUID(),
          userId: randomUUID(),
        },
      },
    ]);
    const execute = jest.fn(async () => ({ affected: 1 }));
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany,
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      execute,
    };
    const manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
      createQueryBuilder: jest.fn(() => qb),
    };
    const dataSource = {
      transaction: jest.fn(async (fn: (m: typeof manager) => Promise<number>) =>
        fn(manager),
      ),
    } as unknown as DataSource;
    const addBulk = jest.fn(async () => []);
    const publisher = new OutboxPublisherService(dataSource, {
      addBulk,
    } as unknown as Queue);

    await publisher.handleCron();

    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(qb.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: EVENT_TYPES.SHOP_INVITATION_CREATED,
        opts: { jobId: eventId },
      }),
    ]);
    expect(qb.set).toHaveBeenCalledWith({
      status: OUTBOX_EVENT_STATUSES.ENQUEUED,
    });
  });
});
