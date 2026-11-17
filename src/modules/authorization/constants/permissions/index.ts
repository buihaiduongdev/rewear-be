import { CHAT_PERMISSIONS } from './chat-permissions.constant';
import { ORDER_PERMISSIONS } from './order-permissions.constant';
import { PICKUP_PERMISSIONS } from './pickup-permissions.constant';
import { PRODUCT_PERMISSIONS } from './product-permissions.constant';
import { SHOP_MANAGEMENT_PERMISSIONS } from './shop-management-permissions.constant';

export * from './chat-permissions.constant';
export * from './order-permissions.constant';
export * from './pickup-permissions.constant';
export * from './product-permissions.constant';
export * from './shop-management-permissions.constant';

export const SHOP_PERMISSIONS = {
  ...SHOP_MANAGEMENT_PERMISSIONS,
  ...PRODUCT_PERMISSIONS,
  ...ORDER_PERMISSIONS,
  ...PICKUP_PERMISSIONS,
  ...CHAT_PERMISSIONS,
} as const;

export type TShopPermission =
  (typeof SHOP_PERMISSIONS)[keyof typeof SHOP_PERMISSIONS];

export const SHOP_PERMISSION_KEYS = Object.values(SHOP_PERMISSIONS);

export const ASSIGNABLE_SHOP_PERMISSION_KEYS = SHOP_PERMISSION_KEYS.filter(
  (permission) => permission !== SHOP_PERMISSIONS.SHOP_OWNER,
);
