import { randomUUID } from 'node:crypto';

import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import { WalletAccount } from '@/modules/wallet/entities';

import { createTestDatabase, type TestDatabase } from '../support/database';
import { disputeReturnFixture } from '../support/dispute-return-fixture';

describe('Dispute return shipment tracking and wallet refund (PostgreSQL)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => database?.destroy());

  it('tracks label -> buyer handover -> seller receipt confirmation and credits wallet once', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    expect(f.returned.state).toBe('WAITING_LABEL');
    expect(await f.refunds.execute(f.decision.id)).toBeNull();

    const labeled = await f.returns.createLabel(f.admin.id, f.returned.id, {
      mode: 'EVIDENCE',
      waybillCode: `GHN-RET-${randomUUID().slice(0, 8)}`,
    });
    expect(labeled.state).toBe('AWAITING_HANDOVER');
    expect(labeled.handoverBy).toBeInstanceOf(Date);

    const inTransit = await f.returns.recordHandover(f.buyer.id, f.returned.id);
    expect(inTransit.state).toBe('IN_TRANSIT');

    await expect(
      f.returns.confirmReceipt(f.buyer.id, f.returned.id),
    ).rejects.toThrow('Shop order management access required');

    const ready = await f.returns.confirmReceipt(f.owner.id, f.returned.id);
    expect(ready.state).toBe('READY');

    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
    expect(
      await f.db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: f.buyer.id }),
    ).toMatchObject({ balance: 100001 });
    expect(
      (await f.db.getRepository(DisputeCase).findOneByOrFail({ id: f.row.id }))
        .state,
    ).toBe('CLOSED');
  });

  it('expires overdue unshipped returns without crediting buyer wallet', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await f.returns.createLabel(f.admin.id, f.returned.id, {
      mode: 'EVIDENCE',
      waybillCode: `GHN-EXP-${randomUUID().slice(0, 8)}`,
    });
    await f.db
      .getRepository(DisputeReturn)
      .update(f.returned.id, { handoverBy: new Date(Date.now() - 1000) });

    expect(await f.refunds.execute(f.decision.id)).toBeNull();
    expect(
      (
        await f.db
          .getRepository(DisputeReturn)
          .findOneByOrFail({ id: f.returned.id })
      ).state,
    ).toBe('EXPIRED');
    expect(
      (
        await f.db
          .getRepository(DisputeIssue)
          .findOneByOrFail({ id: f.issue.id })
      ).status,
    ).toBe('RESOLVED_NO_REFUND');
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
});
