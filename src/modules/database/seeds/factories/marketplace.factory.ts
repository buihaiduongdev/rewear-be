import { createHash } from 'node:crypto';

import { AuthProvider } from '@/modules/auth/enums';
import { Category } from '@/modules/category/entities';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaOwnerType, MediaRole, MediaType } from '@/modules/media/enums';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
import { Shop, ShopMember } from '@/modules/shop/entities';
import {
  ShopMemberRole,
  ShopMemberStatus,
  ShopStatus,
} from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { SEED_ACCOUNTS, SEED_CATEGORIES, SEED_SHOPS } from '../catalog';

/** Pure factories: no DB, network, email or storage calls. IDs are stable per namespace. */
export class MarketplaceFactory {
  constructor(
    readonly namespace = 'demo',
    readonly now = new Date('2026-01-01T12:00:00.000Z'),
  ) {}

  id(key: string): string {
    const bytes = createHash('sha1')
      .update(`rewear-seed:${this.namespace}:${key}`)
      .digest()
      .subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private base(key: string) {
    return { id: this.id(key), createdAt: this.now, updatedAt: this.now };
  }

  user(
    index: number,
    passwordHash: string,
    overrides: Partial<User> = {},
  ): User {
    const account = SEED_ACCOUNTS[index % SEED_ACCOUNTS.length];
    return Object.assign(
      new User(),
      this.base(`user:${index}`),
      {
        email: `${account.key}.${this.namespace}@seed.rewear.test`,
        fullName: account.fullName,
        password: passwordHash,
        provider: AuthProvider.CREDENTIALS,
        providerAccountId: null,
        role: index === 0 ? UserRole.ADMIN : UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      overrides,
    );
  }

  category(index: number, overrides: Partial<Category> = {}): Category {
    const item = SEED_CATEGORIES[index % SEED_CATEGORIES.length];
    return Object.assign(
      new Category(),
      this.base(`category:${index}`),
      {
        name: item.name,
        slug: `seed-${this.namespace}-${item.slug}`,
        requiredMeasurements: [...item.requiredMeasurements],
        isActive: true,
      },
      overrides,
    );
  }

  shop(index: number, overrides: Partial<Shop> = {}): Shop {
    return Object.assign(
      new Shop(),
      this.base(`shop:${index}`),
      SEED_SHOPS[index % SEED_SHOPS.length],
      { status: ShopStatus.ACTIVE },
      overrides,
    );
  }

  shopMember(
    index: number,
    shopId: string,
    userId: string,
    overrides: Partial<ShopMember> = {},
  ): ShopMember {
    return Object.assign(
      new ShopMember(),
      this.base(`member:${index}`),
      {
        shopId,
        userId,
        memberRole: ShopMemberRole.OWNER,
        status: ShopMemberStatus.ACTIVE,
        joinedAt: this.now,
      },
      overrides,
    );
  }

  product(
    index: number,
    source:
      | { categoryId: string; shopId: string; sellerUserId: null }
      | { categoryId: string; sellerUserId: string; shopId: null },
    overrides: Partial<Product> = {},
  ): Product {
    const item = SEED_CATEGORIES[index % SEED_CATEGORIES.length];
    return Object.assign(
      new Product(),
      this.base(`product:${index}`),
      {
        ...source,
        title: `${item.title} ${Math.floor(index / SEED_CATEGORIES.length) + 1}`,
        description:
          'Demo listing for development and end-to-end testing. Please see the photos and measurements before choosing your next piece.',
        condition: [
          ProductCondition.PRISTINE,
          ProductCondition.EXCELLENT,
          ProductCondition.GOOD,
        ][index % 3],
        size: ['S', 'M', 'L', 'XL'][index % 4],
        color: ['Cream', 'Indigo', 'Black', 'Olive'][index % 4],
        brand: ['Uniqlo', 'Levi’s', 'Zara', 'Vintage'][index % 4],
        price: 120000 + (index % 12) * 35000,
        measurements: {
          chest: 96,
          waist: 76,
          hip: 98,
          length: 68,
          shoulder: 42,
          sleeve: 58,
          inseam: 74,
        },
        repairs: null,
        defects: [],
        revision: 1,
        approvedRevision: 1,
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(this.now.getTime() - index * 60000),
        heldUntil: null,
        soldAt: null,
      },
      overrides,
    );
  }

  media(
    productIndex: number,
    slot: number,
    uploadedById: string,
    overrides: Partial<Media> = {},
  ): Media {
    const item = SEED_CATEGORIES[productIndex % SEED_CATEGORIES.length];
    const id = this.id(`media:${productIndex}:${slot}`);
    return Object.assign(
      new Media(),
      this.base(`media:${productIndex}:${slot}`),
      {
        uploadedById,
        storageKey: `seed/${this.namespace}/${this.id(`product:${productIndex}`)}/${id}.jpg`,
        url: `https://images.unsplash.com/${item.photo}?w=800&fit=crop&q=80&fm=jpg`,
        mediaType: MediaType.IMAGE,
        mimeType: 'image/jpeg',
        sizeBytes: item.sizeBytes,
        eTag: null,
        retiredAt: null,
      },
      overrides,
    );
  }

  mediaLink(
    productIndex: number,
    slot: number,
    overrides: Partial<MediaLink> = {},
  ): MediaLink {
    return Object.assign(
      new MediaLink(),
      this.base(`link:${productIndex}:${slot}`),
      {
        mediaId: this.id(`media:${productIndex}:${slot}`),
        ownerType: MediaOwnerType.PRODUCT,
        ownerId: this.id(`product:${productIndex}`),
        role: slot === 0 ? MediaRole.COVER : MediaRole.GALLERY,
        angle: ['FRONT', 'BACK', 'DETAIL'][slot],
        sortOrder: slot,
      },
      overrides,
    );
  }
}
