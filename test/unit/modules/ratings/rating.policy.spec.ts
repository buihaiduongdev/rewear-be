import {
  hasDeliveryProof,
  publicRating,
  summarizeRatings,
} from '@/modules/ratings/rating.policy';
import {
  ratingInputSchema,
  ratingModerationSchema,
  ratingUploadSchema,
} from '@/modules/ratings/schemas/rating.schema';

const proof = {
  deliveredAt: new Date('2026-01-01'),
  mode: 'EVIDENCE',
  actorId: 'actor',
  reason: 'carrier confirmation',
  evidence: 'signed carrier record',
};
const row = {
  id: 'rating',
  buyerId: 'buyer',
  shopId: 'shop',
  orderId: 'private-order',
  stars: 1,
  comment: 'private',
  mediaIds: ['media'],
  reply: 'reply',
  commentHidden: true,
  mediaHidden: true,
  replyHidden: true,
  invalidated: false,
  mode: 'EVIDENCE',
  revision: 2,
  updatedAt: new Date(),
};
describe('verified shop rating policy', () => {
  it('requires integer stars and rejects arbitrary attachment URLs', () => {
    expect(
      ratingInputSchema.safeParse({
        orderId: '00000000-0000-4000-8000-000000000001',
        stars: 1,
      }).success,
    ).toBe(true);
    for (const stars of [0, 6, 1.5])
      expect(
        ratingInputSchema.safeParse({
          orderId: '00000000-0000-4000-8000-000000000001',
          stars,
        }).success,
      ).toBe(false);
    expect(
      ratingInputSchema.safeParse({
        orderId: '00000000-0000-4000-8000-000000000001',
        stars: 2,
        mediaUrls: ['https://foreign'],
      }).success,
    ).toBe(false);
  });
  it('requires durable delivery proof rather than a delivered status', () => {
    expect(
      hasDeliveryProof(
        { deliveryVerifiedAt: proof.deliveredAt },
        proof,
        new Date('2026-02-01'),
      ),
    ).toBe(true);
    expect(
      hasDeliveryProof(
        { deliveryVerifiedAt: proof.deliveredAt },
        null,
        new Date(),
      ),
    ).toBe(false);
    expect(
      hasDeliveryProof(
        { deliveryVerifiedAt: new Date('2025-01-01') },
        proof,
        new Date(),
      ),
    ).toBe(false);
    expect(
      hasDeliveryProof(
        { deliveryVerifiedAt: proof.deliveredAt },
        { ...proof, evidence: '' },
        new Date(),
      ),
    ).toBe(false);
  });
  it('retains stars while excluding every hidden component and private order references', () => {
    const view = publicRating(row as never);
    expect(view).toMatchObject({
      stars: 1,
      comment: null,
      mediaIds: [],
      reply: null,
    });
    expect(view).not.toHaveProperty('orderId');
    expect(view).not.toHaveProperty('buyerId');
  });
  it('isolates simulation and invalidated ratings in aggregate', () => {
    expect(
      summarizeRatings(
        [
          row,
          { ...row, stars: 5, mode: 'SIMULATION' },
          { ...row, stars: 5, invalidated: true },
        ] as never,
        'EVIDENCE',
      ),
    ).toEqual({
      mode: 'EVIDENCE',
      count: 1,
      average: 1,
      distribution: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      verifiedBuyerCount: 1,
    });
  });
  it('requires violation basis for content hiding and explicit fraud proof for exclusion', () => {
    expect(
      ratingModerationSchema.safeParse({
        component: 'rating',
        hidden: true,
        basis: 'LOW_STARS',
        reason: 'bad stars',
        evidence: 'one star',
      }).success,
    ).toBe(false);
    expect(
      ratingModerationSchema.safeParse({
        component: 'rating',
        hidden: true,
        basis: 'FRAUD',
        reason: 'verified fake order',
        evidence: 'investigation record',
      }).success,
    ).toBe(true);
    expect(
      ratingModerationSchema.safeParse({
        component: 'comment',
        hidden: true,
        basis: 'CONTENT_VIOLATION',
        reason: 'abuse',
        evidence: 'reviewed text',
      }).success,
    ).toBe(true);
  });
  it('requires an order and a media ID to attach rating media', () => {
    const orderId = '00000000-0000-4000-8000-000000000001';
    const mediaId = '00000000-0000-4000-8000-000000000002';
    expect(ratingUploadSchema.safeParse({ orderId, mediaId }).success).toBe(
      true,
    );
    expect(
      ratingUploadSchema.safeParse({ orderId, mediaId: 'invalid' }).success,
    ).toBe(false);
  });
});
