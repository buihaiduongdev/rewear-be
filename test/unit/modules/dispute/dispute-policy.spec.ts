import {
  businessDeadline,
  hasMinimumDisputeEvidence,
} from '@/modules/dispute/constants/dispute.constant';
import { resolveDecisionRefundAmount } from '@/modules/dispute/dispute-adjudication.service';
import { reverseReturnPayload } from '@/modules/dispute/returns/return.service';

describe('Dispute business deadlines, evidence rules, and return payload', () => {
  it('skips Saturday and Sunday when computing Vietnam 17:00 ICT business deadlines', () => {
    // Friday 2026-11-20 08:00 UTC (15:00 ICT) + 1 business day -> Monday 2026-11-23 17:00 ICT (10:00 UTC)
    const friday = new Date('2026-11-20T08:00:00.000Z');
    expect(businessDeadline(friday, 1).toISOString()).toBe(
      '2026-11-23T10:00:00.000Z',
    );
    // +3 business days -> Wednesday 2026-11-25 10:00 UTC
    expect(businessDeadline(friday, 3).toISOString()).toBe(
      '2026-11-25T10:00:00.000Z',
    );
    // +5 business days -> Friday 2026-11-27 10:00 UTC
    expect(businessDeadline(friday, 5).toISOString()).toBe(
      '2026-11-27T10:00:00.000Z',
    );
  });

  it('accepts unboxing video or kind-specific photo tags for dispute intake', () => {
    expect(hasMinimumDisputeEvidence('WRONG_ITEM', ['ISSUE'])).toBe(true);
    expect(hasMinimumDisputeEvidence('NOT_AS_DESCRIBED', ['UNBOX'])).toBe(true);
    expect(hasMinimumDisputeEvidence('WRONG_ITEM', ['LABEL'])).toBe(false);

    expect(
      hasMinimumDisputeEvidence('MISSING_ITEM', [
        'PARCEL',
        'LABEL',
        'RECEIVED_ITEMS',
      ]),
    ).toBe(true);
    expect(hasMinimumDisputeEvidence('MISSING_ITEM', ['UNBOX'])).toBe(true);
    expect(hasMinimumDisputeEvidence('MISSING_ITEM', ['ISSUE'])).toBe(false);

    expect(
      hasMinimumDisputeEvidence('TRANSIT_DAMAGE', [
        'PARCEL',
        'LABEL',
        'DAMAGE',
      ]),
    ).toBe(true);
    expect(hasMinimumDisputeEvidence('TRANSIT_DAMAGE', ['UNBOX'])).toBe(true);
  });

  it('validates adjudication outcomes and bounded refund amounts', () => {
    expect(
      resolveDecisionRefundAmount(
        'WRONG_ITEM',
        'REJECT_CLAIM',
        'UNDETERMINED',
        100_000,
        null,
      ),
    ).toBeNull();
    expect(() =>
      resolveDecisionRefundAmount(
        'WRONG_ITEM',
        'REJECT_CLAIM',
        'UNDETERMINED',
        100_000,
        10_000,
      ),
    ).toThrow('Rejected claims cannot authorize a refund');

    expect(
      resolveDecisionRefundAmount(
        'WRONG_ITEM',
        'REQUIRE_RETURN',
        'SELLER',
        100_000,
      ),
    ).toBe(100_000);
    expect(() =>
      resolveDecisionRefundAmount(
        'MISSING_ITEM',
        'REQUIRE_RETURN',
        'SELLER',
        100_000,
      ),
    ).toThrow('Missing item cannot require return');
    expect(() =>
      resolveDecisionRefundAmount(
        'WRONG_ITEM',
        'REQUIRE_RETURN',
        'CARRIER',
        100_000,
      ),
    ).toThrow('Seller fault is required');

    expect(
      resolveDecisionRefundAmount(
        'NOT_AS_DESCRIBED',
        'UPHOLD_CLAIM',
        'SELLER',
        100_000,
        40_000,
      ),
    ).toBe(40_000);
    expect(() =>
      resolveDecisionRefundAmount(
        'NOT_AS_DESCRIBED',
        'UPHOLD_CLAIM',
        'SELLER',
        100_000,
        100_001,
      ),
    ).toThrow('within snapshotted item price');
  });

  it('reverses forward GHN shipment route with zero buyer COD', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const payload = reverseReturnPayload(
      {
        from_name: 'Original shop',
        from_phone: '0901111111',
        from_address: 'Shop street',
        from_district_id: 12,
        from_ward_code: 'A',
        to_name: 'Buyer',
        to_phone: '0902222222',
        to_address: 'Buyer street',
        to_district_id: 34,
        to_ward_code: 'B',
        cod_amount: 500_000,
      },
      id,
      { weightGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10 },
    );
    expect(payload).toMatchObject({
      from_address: 'Buyer street',
      to_address: 'Shop street',
      from_district_id: 34,
      to_ward_code: 'A',
      cod_amount: 0,
      payment_type_id: 1,
      client_order_code: id,
    });
  });
});
