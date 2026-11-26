import type { ShopRating } from './entities';
import type { RatingMode } from './schemas/rating.schema';

export function hasDeliveryProof(
  order: { deliveryVerifiedAt?: Date | null; cancelledAt?: Date | null },
  proof: {
    deliveredAt: Date;
    mode: string;
    actorId: string;
    reason: string;
    evidence: string;
  } | null,
  now: Date,
) {
  return Boolean(
    proof &&
    proof.deliveredAt <= now &&
    (!order.cancelledAt || order.cancelledAt > proof.deliveredAt) &&
    order.deliveryVerifiedAt?.getTime() === proof.deliveredAt.getTime() &&
    ['EVIDENCE', 'SIMULATION'].includes(proof.mode) &&
    proof.actorId &&
    proof.reason?.trim() &&
    proof.evidence?.trim(),
  );
}
export function publicRating(row: ShopRating) {
  return {
    id: row.id,
    shopId: row.shopId,
    stars: row.stars,
    comment: row.commentHidden ? null : row.comment,
    mediaIds: row.mediaHidden ? [] : row.mediaIds,
    reply: row.replyHidden ? null : row.reply,
    revision: row.revision,
    updatedAt: row.updatedAt,
    mode: row.mode,
    verifiedTransaction: true,
  };
}
export function summarizeRatings(rows: ShopRating[], mode: RatingMode) {
  const eligible = rows.filter((row) => row.mode === mode && !row.invalidated);
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of eligible) distribution[row.stars]++;
  return {
    mode,
    count: eligible.length,
    average: eligible.length
      ? eligible.reduce((sum, row) => sum + row.stars, 0) / eligible.length
      : null,
    distribution,
    verifiedBuyerCount: new Set(eligible.map((row) => row.buyerId)).size,
  };
}
