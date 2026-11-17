export type ShopPermissionPolicy =
  | { type: 'public' }
  | { type: 'authenticated' }
  | { type: 'shop'; permission: string };
