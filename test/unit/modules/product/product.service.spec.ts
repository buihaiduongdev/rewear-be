import { BadRequestException, ConflictException } from '@nestjs/common';

import type { DataSource, EntityManager, Repository } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductCondition,
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { ProductService } from '@/modules/product/product.service';
import {
  createProductSchema,
  moderateProductSchema,
  updateProductStatusSchema,
} from '@/modules/product/schemas';
import { Shop, ShopMember } from '@/modules/shop/entities';

describe('Product lifecycle boundaries', () => {
  const service = new ProductService(
    {} as Repository<Product>,
    {} as Repository<Category>,
    {} as Repository<Shop>,
    {} as Repository<ShopMember>,
    {} as DataSource,
    {} as never,
    { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
    { record: jest.fn() } as never,
  );

  it.each([
    ProductStatus.HELD,
    ProductStatus.SOLD,
    ProductStatus.SUSPENDED,
    ProductStatus.PENDING_REVIEW,
  ])('blocks edits while %s', (status) => {
    expect(() =>
      service.assertEditable(Object.assign(new Product(), { status })),
    ).toThrow(ConflictException);
  });

  it('requires a shop for a draft and forbids seller-controlled lifecycle fields', () => {
    expect(createProductSchema.safeParse({}).success).toBe(false);
    expect(
      createProductSchema.parse({
        shopId: '7ecf9b7f-fcd2-4ab2-8768-c17773433b68',
      }),
    ).toEqual({ shopId: '7ecf9b7f-fcd2-4ab2-8768-c17773433b68' });
    expect(createProductSchema.safeParse({ revision: 10 }).success).toBe(false);
    expect(
      updateProductStatusSchema.safeParse({ status: 'SOLD' }).success,
    ).toBe(false);
    expect(
      updateProductStatusSchema.safeParse({ status: 'HELD' }).success,
    ).toBe(false);
  });

  it('requires a current revision and a nonblank rejection reason', () => {
    expect(
      moderateProductSchema.safeParse({ version: 1, decision: 'REJECT' })
        .success,
    ).toBe(false);
    expect(
      moderateProductSchema.safeParse({
        version: 1,
        decision: 'REJECT',
        reason: '   ',
      }).success,
    ).toBe(false);
    expect(
      moderateProductSchema.parse({
        version: 1,
        decision: 'REJECT',
        reason: ' Thiếu ảnh ',
      }).reason,
    ).toBe('Thiếu ảnh');
  });
});

describe('ProductService.update re-moderation', () => {
  const makePublishedProduct = (status: ProductStatus): Product =>
    Object.assign(new Product(), {
      id: '11111111-1111-4111-8111-111111111111',
      shopId: '22222222-2222-4222-8222-222222222222',
      categoryId: '33333333-3333-4333-8333-333333333333',
      title: 'Vintage Denim Jacket',
      description: 'Clean vintage jacket in great condition',
      condition: ProductCondition.GOOD,
      size: 'M',
      color: 'Blue',
      brand: 'Levis',
      price: 250000,
      measurements: {},
      defects: [],
      shippingPackage: null,
      repairs: null,
      status,
    });

  const createServiceForUpdate = (
    product: Product,
    moderation: ProductModeration | null,
  ) => {
    const manager = {
      findOneOrFail: jest.fn().mockResolvedValue(product),
      findOneBy: jest.fn().mockResolvedValue(moderation),
      create: jest.fn((_entity, data) => data),
      save: jest.fn((_entity, data) => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager),
      ),
    } as unknown as DataSource;

    const service = new ProductService(
      {} as Repository<Product>,
      {} as Repository<Category>,
      {} as Repository<Shop>,
      {} as Repository<ShopMember>,
      dataSource,
      {} as never,
      { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
      { record: jest.fn() } as never,
    );

    jest.spyOn(service, 'findManagedProduct').mockResolvedValue({
      ...product,
      coverUrl: null,
      mediaCount: 3,
    });

    return { service, manager };
  };

  it.each([ProductStatus.ACTIVE, ProductStatus.HIDDEN])(
    'moves %s listing back to PENDING_REVIEW when only price is edited',
    async (status) => {
      const product = makePublishedProduct(status);
      const moderation = Object.assign(new ProductModeration(), {
        productId: product.id,
        version: 1,
        status: ProductModerationStatus.APPROVED,
        reason: null,
      });
      const { service, manager } = createServiceForUpdate(product, moderation);

      await service.update(
        product.id,
        'seller-1',
        { price: 320000 },
        product.shopId,
      );

      expect(product.price).toBe(320000);
      expect(product.status).toBe(ProductStatus.PENDING_REVIEW);
      expect(moderation.version).toBe(2);
      expect(moderation.status).toBe(ProductModerationStatus.PENDING);
      expect(moderation.reason).toBeNull();
      expect(manager.save).toHaveBeenCalledWith(ProductModeration, moderation);
      expect(manager.save).toHaveBeenCalledWith(Product, product);
    },
  );

  it('rejects non-positive price edits on published listings', async () => {
    const product = makePublishedProduct(ProductStatus.ACTIVE);
    const { service } = createServiceForUpdate(product, null);

    await expect(
      service.update(product.id, 'seller-1', { price: 0 }, product.shopId),
    ).rejects.toThrow(BadRequestException);
    expect(product.status).toBe(ProductStatus.ACTIVE);
  });

  it('keeps DRAFT listing in DRAFT when price is edited', async () => {
    const product = makePublishedProduct(ProductStatus.DRAFT);
    const { service, manager } = createServiceForUpdate(product, null);

    await service.update(
      product.id,
      'seller-1',
      { price: 280000 },
      product.shopId,
    );

    expect(product.price).toBe(280000);
    expect(product.status).toBe(ProductStatus.DRAFT);
    expect(manager.update).toHaveBeenCalledWith(
      ProductModeration,
      { productId: product.id },
      { status: ProductModerationStatus.DRAFT, reason: null },
    );
  });

  it('does not re-moderate ACTIVE listing when price is unchanged', async () => {
    const product = makePublishedProduct(ProductStatus.ACTIVE);
    const { service, manager } = createServiceForUpdate(product, null);

    await service.update(
      product.id,
      'seller-1',
      { price: 250000 },
      product.shopId,
    );

    expect(product.status).toBe(ProductStatus.ACTIVE);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
