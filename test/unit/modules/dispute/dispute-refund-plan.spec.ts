import {
  assertDisputeRefundPlan,
  validateDisputeRefundPlan,
} from '@/modules/dispute/policies/dispute-refund-plan.policy';
import { disputeAppealConclusionSchema } from '@/modules/dispute/schemas/dispute-appeal.schema';
import { disputeDecisionInputSchema } from '@/modules/dispute/schemas/dispute-decision.schema';

describe('exact dispute refund plan', () => {
  const input = {
    requestId: '00000000-0000-4000-8000-000000000001',
    reviewToken: 'a'.repeat(64),
    outcome: 'UPHOLD_CLAIM',
    responsibility: 'SELLER',
    reason: 'reason',
    evidenceAssessment: 'assessment',
  };
  it('accepts absent legacy plans and explicit null without creating an entitlement', () => {
    expect(() =>
      assertDisputeRefundPlan('MISSING_ITEM', 'UPHOLD_CLAIM', 100, null),
    ).not.toThrow();
    expect(disputeDecisionInputSchema.parse(input).refundPlan).toBeUndefined();
    expect(
      disputeAppealConclusionSchema.parse({ ...input, refundPlan: null })
        .refundPlan,
    ).toBeNull();
  });
  it.each([0, -1, 1.5, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid exact amount %s',
    (amount) => {
      expect(() =>
        assertDisputeRefundPlan('MISSING_ITEM', 'UPHOLD_CLAIM', 100, {
          amount,
          condition: 'MISSING_ITEM',
        }),
      ).toThrow('Refund plan is incompatible');
    },
  );
  it('permits full missing-item entitlement only under its matching condition', () => {
    expect(() =>
      assertDisputeRefundPlan('MISSING_ITEM', 'UPHOLD_CLAIM', 100, {
        amount: 100,
        condition: 'MISSING_ITEM',
      }),
    ).not.toThrow();
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'UPHOLD_CLAIM', 100, {
        amount: 100,
        condition: 'MISSING_ITEM',
      }),
    ).toThrow('Refund plan is incompatible');
    expect(() =>
      assertDisputeRefundPlan('MISSING_ITEM', 'UPHOLD_CLAIM', 100, {
        amount: 100,
        condition: 'SELLER_WAIVER',
      }),
    ).toThrow('Refund plan is incompatible');
  });
  it('requires the return condition exactly for return outcomes', () => {
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'REQUIRE_RETURN', 100, {
        amount: 100,
        condition: 'RETURN_REQUIRED',
      }),
    ).not.toThrow();
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'REQUIRE_RETURN', 100, {
        amount: 100,
        condition: 'SAFETY_WAIVER',
      }),
    ).toThrow('Refund plan is incompatible');
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'UPHOLD_CLAIM', 100, {
        amount: 100,
        condition: 'RETURN_REQUIRED',
      }),
    ).toThrow('Refund plan is incompatible');
  });
  it('limits partial agreements to a strict discount and all other conditions to full price', () => {
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'UPHOLD_CLAIM', 100, {
        amount: 50,
        condition: 'PARTIAL_AGREEMENT',
      }),
    ).not.toThrow();
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'UPHOLD_CLAIM', 100, {
        amount: 100,
        condition: 'PARTIAL_AGREEMENT',
      }),
    ).toThrow('Refund plan is incompatible');
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'UPHOLD_CLAIM', 100, {
        amount: 50,
        condition: 'SELLER_WAIVER',
      }),
    ).toThrow('Refund plan is incompatible');
  });
  it('forbids a rejected claim refund while accepting omitted/null plans', () => {
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'REJECT_CLAIM', 100, null),
    ).not.toThrow();
    expect(() =>
      assertDisputeRefundPlan('WRONG_ITEM', 'REJECT_CLAIM', 100, {
        amount: 100,
        condition: 'SELLER_WAIVER',
      }),
    ).toThrow('Refund plan is incompatible');
    for (const schema of [
      disputeDecisionInputSchema,
      disputeAppealConclusionSchema,
    ]) {
      expect(
        schema.safeParse({
          ...input,
          outcome: 'REJECT_CLAIM',
          refundPlan: { amount: 100, condition: 'SELLER_WAIVER' },
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...input,
          outcome: 'REJECT_CLAIM',
          refundPlan: null,
        }).success,
      ).toBe(true);
    }
  });
  it.each([
    ['WRONG_ITEM', 'REQUIRE_RETURN', 100, 'RETURN_REQUIRED', true],
    ['WRONG_ITEM', 'REQUIRE_RETURN', 100, 'SELLER_WAIVER', false],
    ['WRONG_ITEM', 'UPHOLD_CLAIM', 100, 'RETURN_REQUIRED', false],
    ['MISSING_ITEM', 'UPHOLD_CLAIM', 100, 'MISSING_ITEM', true],
    ['MISSING_ITEM', 'UPHOLD_CLAIM', 50, 'PARTIAL_AGREEMENT', true],
    ['MISSING_ITEM', 'REQUIRE_RETURN', 100, 'RETURN_REQUIRED', false],
    ['WRONG_ITEM', 'UPHOLD_CLAIM', 100, 'MISSING_ITEM', false],
    ['MISSING_ITEM', 'UPHOLD_CLAIM', 100, 'SELLER_WAIVER', false],
    ['WRONG_ITEM', 'UPHOLD_CLAIM', 100, 'SAFETY_WAIVER', true],
    ['WRONG_ITEM', 'UPHOLD_CLAIM', 99, 'PARTIAL_AGREEMENT', true],
    ['WRONG_ITEM', 'UPHOLD_CLAIM', 101, 'PARTIAL_AGREEMENT', false],
    ['WRONG_ITEM', 'UPHOLD_CLAIM', 0, 'PARTIAL_AGREEMENT', false],
    ['WRONG_ITEM', 'UPHOLD_CLAIM', -1, 'PARTIAL_AGREEMENT', false],
    ['WRONG_ITEM', 'UPHOLD_CLAIM', 99.5, 'PARTIAL_AGREEMENT', false],
  ] as const)(
    'validates %s / %s / %s / %s',
    (kind, outcome, amount, condition, allowed) => {
      expect(
        validateDisputeRefundPlan(kind, outcome, 100, { amount, condition }),
      ).toBe(allowed);
    },
  );
  it('rejects extra plan fields and fractional input at both decision entry points', () => {
    for (const schema of [
      disputeDecisionInputSchema,
      disputeAppealConclusionSchema,
    ]) {
      expect(
        schema.safeParse({
          ...input,
          refundPlan: { amount: 1.5, condition: 'SELLER_WAIVER' },
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...input,
          refundPlan: { amount: 100, condition: 'SELLER_WAIVER', ready: true },
        }).success,
      ).toBe(false);
    }
  });
});
