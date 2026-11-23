import { NotFoundException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { Order } from '@/modules/order/entities/order.entity';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { REPORT_TARGET } from '../constants/report.constant';
import type {
  ReportTargetSnapshot,
  ReportTargetType,
} from '../types/report.type';

export async function reportTargetSnapshot(
  manager: EntityManager,
  userId: string,
  type: ReportTargetType,
  id: string,
): Promise<ReportTargetSnapshot> {
  if (type === REPORT_TARGET.SHOP) {
    const shop = await manager.findOneBy(Shop, {
      id,
      status: ShopStatus.ACTIVE,
    });
    if (shop)
      return { type, id, shopId: id, label: shop.name, contextOrderId: null };
    const order = await manager.findOne(Order, {
      where: { buyerId: userId, shopId: id },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    if (order)
      return {
        type,
        id,
        shopId: id,
        label: order.shopName,
        contextOrderId: order.id,
      };
  } else {
    const product = await manager.findOneBy(Product, {
      id,
      status: ProductStatus.ACTIVE,
    });
    const isPublic =
      product?.categoryId &&
      (await manager.existsBy(Category, {
        id: product.categoryId,
        isActive: true,
      })) &&
      (await manager.existsBy(Shop, {
        id: product.shopId,
        status: ShopStatus.ACTIVE,
      })) &&
      (await manager.existsBy(ProductModeration, {
        productId: id,
        status: ProductModerationStatus.APPROVED,
      }));
    if (product && isPublic)
      return {
        type,
        id,
        shopId: product.shopId,
        label: product.title ?? '',
        contextOrderId: null,
      };
    const order = await manager
      .createQueryBuilder(Order, 'order')
      .where('order.buyerId = :userId', { userId })
      .andWhere('order.items @> CAST(:items AS jsonb)', {
        items: JSON.stringify([{ productId: id }]),
      })
      .orderBy('order.createdAt', 'DESC')
      .addOrderBy('order.id', 'DESC')
      .getOne();
    const item = order?.items.find((item) => item.productId === id);
    if (order && item)
      return {
        type,
        id,
        shopId: order.shopId,
        label: item.title,
        contextOrderId: order.id,
      };
  }
  throw new NotFoundException('Report target not available');
}
