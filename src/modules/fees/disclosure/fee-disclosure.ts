import { ConflictException } from '@nestjs/common';

import { EntityManager, In } from 'typeorm';

import { FeePolicy, FeePolicyShopAcceptance } from './entities';
import {
  type FeeDisclosure,
  feeDisclosureSchema,
} from './fee-disclosure.schema';

export async function currentFeePolicy(manager: EntityManager) {
  return manager.findOne(FeePolicy, { where: {}, order: { version: 'DESC' } });
}
export async function snapshotFeeDisclosure(
  manager: EntityManager,
  input: { feePolicyId?: string; feeTermsAccepted?: true },
  shopIds: string[],
  now: Date,
): Promise<FeeDisclosure | null> {
  const explicitBuyerAcceptance =
    !!input.feePolicyId && input.feeTermsAccepted === true;
  if (Boolean(input.feePolicyId) !== Boolean(input.feeTermsAccepted))
    throw new ConflictException('Explicit fee terms acceptance is required');
  const policy = await currentFeePolicy(manager);
  if (!policy) {
    if (explicitBuyerAcceptance)
      throw new ConflictException('No fee policy is published');
    return null;
  }
  if (
    (explicitBuyerAcceptance && policy.id !== input.feePolicyId) ||
    policy.publishedAt > now
  )
    throw new ConflictException('Accept the current published fee policy');
  const accepted = shopIds.length
    ? await manager.find(FeePolicyShopAcceptance, {
        where: { policyId: policy.id, shopId: In(shopIds) },
      })
    : [];
  return {
    policyId: policy.id,
    version: policy.version,
    publishedAt: policy.publishedAt.toISOString(),
    buyerAcceptedAt: explicitBuyerAcceptance ? now.toISOString() : null,
    sellers: Object.fromEntries(
      accepted
        .filter(
          (row) =>
            row.acceptedAt >= policy.publishedAt && row.acceptedAt <= now,
        )
        .map((row) => [
          row.shopId,
          {
            sellerAcceptedAt: row.acceptedAt.toISOString(),
            ownerId: row.ownerId,
          },
        ]),
    ),
  };
}
export async function verifyFeeDisclosure(
  manager: EntityManager,
  order: {
    feeDisclosure?: FeeDisclosure | null;
    shopId: string;
    createdAt: Date;
  },
  party: 'BUYER' | 'SHOP',
  kind: string,
): Promise<boolean> {
  const parsed = feeDisclosureSchema.safeParse(order.feeDisclosure);
  if (!parsed.success) return false;
  const snapshot = parsed.data;
  const policy = await manager.findOneBy(FeePolicy, { id: snapshot.policyId });
  if (
    !policy ||
    policy.version !== snapshot.version ||
    policy.publishedAt.toISOString() !== snapshot.publishedAt ||
    !policy.conditions.some((condition) => condition.kind === kind)
  )
    return false;
  const acceptedAt =
    party === 'BUYER'
      ? snapshot.buyerAcceptedAt
      : snapshot.sellers[order.shopId]?.sellerAcceptedAt;
  if (
    !acceptedAt ||
    Date.parse(acceptedAt) < policy.publishedAt.getTime() ||
    Date.parse(acceptedAt) > order.createdAt.getTime()
  )
    return false;
  if (party === 'BUYER') return true;
  const row = await manager.findOneBy(FeePolicyShopAcceptance, {
    shopId: order.shopId,
    policyId: policy.id,
  });
  return (
    !!row &&
    row.acceptedAt.toISOString() === acceptedAt &&
    row.ownerId === snapshot.sellers[order.shopId]?.ownerId
  );
}
