import { createHash } from 'node:crypto';

import { ConflictException } from '@nestjs/common';

import { EntityManager, In } from 'typeorm';

import { reconciliationMoney } from '@/modules/cod-reconciliation/policies/cod-reconciliation-money.policy';
import { Order } from '@/modules/order/entities';

import { DisputeAttachment } from './entities/dispute-attachment.entity';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeMessage } from './entities/dispute-message.entity';

export const decisionFingerprint = (data: unknown) =>
  createHash('sha256').update(JSON.stringify(data)).digest('hex');

export async function loadDecisionReview(
  manager: EntityManager,
  issueId: string,
) {
  const issue = await manager.findOneByOrFail(DisputeIssue, { id: issueId });
  const row = await manager.findOneByOrFail(DisputeCase, { id: issue.caseId });
  const order = await manager.findOneByOrFail(Order, { id: row.orderId });
  const item = order.items.find((item) => item.productId === issue.productId);
  const sourceMatches =
    row.buyerId === order.buyerId && row.shopId === order.shopId && item;
  if (!sourceMatches)
    throw new ConflictException('Case/order snapshot requires review');
  reconciliationMoney(order);
  const attachments = await manager.find(DisputeAttachment, {
    where: { issueId },
    order: { evidenceId: 'ASC' },
  });
  const ids = attachments.map((attachment) => attachment.evidenceId);
  const evidence = ids.length
    ? await manager.find(DisputeEvidence, {
        where: {
          id: In(ids),
          orderId: order.id,
        },
        order: { id: 'ASC' },
      })
    : [];
  if (evidence.length !== ids.length)
    throw new ConflictException('Evidence snapshot requires review');
  const messages = await manager.find(DisputeMessage, {
    where: { issueId },
    order: { createdAt: 'ASC', id: 'ASC' },
  });
  const orderSnapshot = {
    orderId: order.id,
    shopId: order.shopId,
    buyerId: order.buyerId,
    productId: issue.productId,
    itemPrice: item.price,
    commissionBasisPoints: order.commissionBasisPoints,
  };
  const token = decisionFingerprint({
    order: orderSnapshot,
    orderItems: order.items,
    orderTotal: order.total,
    shippingFee: order.shippingFee,
    issue: {
      id: issue.id,
      kind: issue.kind,
      description: issue.description,
      validAt: issue.validAt,
    },
    evidence: evidence.map((file) => ({
      id: file.id,
      owner: file.uploadedById,
      tags: file.tags,
      mediaId: file.mediaId,
    })),
    messages: messages.map((message) => ({
      id: message.id,
      actorId: message.actorId,
      party: message.party,
      text: message.text,
      evidenceIds: message.evidenceIds,
      createdAt: message.createdAt,
    })),
  });
  return {
    issue,
    row,
    order,
    orderSnapshot,
    evidence,
    messages,
    reviewToken: token,
  };
}
