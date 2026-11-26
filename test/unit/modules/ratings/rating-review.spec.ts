import { hasDeliveryProof } from '@/modules/ratings/ratings.service';
import { ratingModerationSchema } from '@/modules/ratings/schemas/rating.schema';

it('does not treat a cancellation preceding delivery as verified eligibility', () => {
  const deliveredAt = new Date('2026-01-02');
  expect(
    hasDeliveryProof(
      {
        deliveryVerifiedAt: deliveredAt,
        cancelledAt: new Date('2026-01-01'),
      } as never,
      {
        deliveredAt,
        mode: 'EVIDENCE',
        actorId: 'actor',
        reason: 'carrier',
        evidence: 'record',
      },
      new Date('2026-01-03'),
    ),
  ).toBe(false);
});
it('allows restoring hidden content with verified REVIEW_APPROVED basis', () => {
  const input = {
    component: 'comment',
    hidden: false,
    basis: 'REVIEW_APPROVED',
    reason: 'Reviewed compliant edit',
    evidence: 'Current text review',
  };
  expect(ratingModerationSchema.safeParse(input).success).toBe(true);
});
