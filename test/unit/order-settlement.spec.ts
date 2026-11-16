import ms from 'ms';

import { isSettlementWindowDue } from '@/modules/order/policies/order-settlement.policy';

describe('72 continuous hour dispute window', () => {
  const deliveredAt = new Date('2026-11-13T15:00:00.000Z');
  const disputeDeadlineAt = new Date(deliveredAt.getTime() + ms('72h'));
  const verification = { deliveredAt, disputeDeadlineAt };
  const order = { deliveryVerifiedAt: deliveredAt, disputeDeadlineAt };
  it('includes a weekend and does not release one millisecond early', () => {
    expect(
      isSettlementWindowDue(
        order,
        verification,
        new Date(disputeDeadlineAt.getTime() - 1),
      ),
    ).toBe(false);
    expect(isSettlementWindowDue(order, verification, disputeDeadlineAt)).toBe(
      true,
    );
  });
  it('requires verified delivery and the same snapshotted deadline', () => {
    expect(isSettlementWindowDue(order, null, disputeDeadlineAt)).toBe(false);
    expect(
      isSettlementWindowDue(
        { ...order, deliveryVerifiedAt: null },
        verification,
        disputeDeadlineAt,
      ),
    ).toBe(false);
    expect(
      isSettlementWindowDue(
        { ...order, disputeDeadlineAt: deliveredAt },
        verification,
        disputeDeadlineAt,
      ),
    ).toBe(false);
  });
  it('rejects a matching but shortened window', () => {
    const shortDeadline = new Date(deliveredAt.getTime() + ms('1h'));
    expect(
      isSettlementWindowDue(
        { ...order, disputeDeadlineAt: shortDeadline },
        { ...verification, disputeDeadlineAt: shortDeadline },
        disputeDeadlineAt,
      ),
    ).toBe(false);
  });
});
