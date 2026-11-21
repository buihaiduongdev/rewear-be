import { BadRequestException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { Order } from '@/modules/order/entities/order.entity';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';

import { CHAT_CARD } from '../constants/chat.constant';
import type { ChatConversation } from '../entities/chat.entity';
import type { ChatCardSnapshot, SendChatInput } from '../types/chat.type';

export async function chatCardSnapshot(
  manager: EntityManager,
  conversation: ChatConversation,
  card: SendChatInput['card'],
): Promise<ChatCardSnapshot | null> {
  if (!card) return null;
  if (card.type === CHAT_CARD.ORDER) {
    const order = await manager.findOneBy(Order, {
      id: card.id,
      buyerId: conversation.buyerId,
      shopId: conversation.shopId,
    });
    if (!order)
      throw new BadRequestException(
        'Order card must belong to this buyer and Shop',
      );
    return { type: CHAT_CARD.ORDER, id: order.id, status: order.status };
  }
  const product = await manager.findOneBy(Product, {
    id: card.id,
    shopId: conversation.shopId,
    status: ProductStatus.ACTIVE,
  });
  const approved =
    product &&
    (await manager.existsBy(ProductModeration, {
      productId: product.id,
      status: ProductModerationStatus.APPROVED,
    }));
  if (!product || !approved)
    throw new BadRequestException(
      'Product card must be a public approved listing of this Shop',
    );
  return {
    type: CHAT_CARD.PRODUCT,
    id: product.id,
    title: product.title ?? '',
    price: product.price,
    status: product.status,
  };
}
