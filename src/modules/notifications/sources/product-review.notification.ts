import type { EntityManager } from 'typeorm';

import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import type { Product, ProductModeration } from '@/modules/product/entities';

import {
  NOTIFICATION_KIND,
  NOTIFICATION_TARGET,
} from '../constants/notification.constant';
import { publishNotification } from '../publish-notification';
import { shopRecipients } from './notification-recipients';

export async function notifyProductReview(
  manager: EntityManager,
  product: Product,
  moderation: ProductModeration,
) {
  return publishNotification(manager, {
    key: `product-review:${moderation.id}:${moderation.version}:${moderation.status}`,
    kind: NOTIFICATION_KIND.PRODUCT_REVIEW,
    targetType: NOTIFICATION_TARGET.PRODUCT,
    sourceId: product.id,
    title: 'Kết quả duyệt tin đăng',
    body: 'Tin đăng của Shop đã có kết quả xét duyệt. Mở quản lý sản phẩm để xem kết quả.',
    mode: null,
    email: true,
    recipients: await shopRecipients(
      manager,
      product.shopId,
      SHOP_PERMISSIONS.PRODUCT_VIEW,
    ),
  });
}
