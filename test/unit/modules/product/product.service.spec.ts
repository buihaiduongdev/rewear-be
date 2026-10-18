import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { Repository } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
import { ProductService } from '@/modules/product/product.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';

describe('ProductService', () => {
  const sellerId = 'eb9ab2f0-97dd-456c-809f-75831b227895';
  const otherUserId = '40e2a58e-e61f-4c6c-a0b6-6e98b282c344';
  const categoryId = '937cb9f3-b770-4a32-99d4-608d50941b85';
  const shopId = 'f844ab9a-6f7a-4495-bc34-064bf3bf32d5';
  const productId = '598745cf-8764-499a-ad43-e6223713ee90';
  const category = {
    id: categoryId,
    name: 'Áo',
    slug: 'ao',
    isActive: true,
  } as Category;
  const seller = { id: sellerId, fullName: 'Nguyễn An' } as User;
  const product: Product = {
    id: productId,
    categoryId,
    category,
    sellerUserId: sellerId,
    seller,
    shopId: null,
    shop: null,
    title: 'Áo khoác denim',
    description: null,
    condition: ProductCondition.GOOD,
    size: 'M',
    color: 'Xanh',
    brand: null,
    price: 250000,
    status: ProductStatus.DRAFT,
    publishedAt: null,
    heldUntil: null,
    soldAt: null,
    createdAt: new Date('2026-10-18T00:00:00.000Z'),
    updatedAt: new Date('2026-10-18T00:00:00.000Z'),
  };

  const productRepository: jest.Mocked<
    Pick<Repository<Product>, 'findOne' | 'create' | 'save'>
  > = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const categoryRepository: jest.Mocked<
    Pick<Repository<Category>, 'findOneBy'>
  > = {
    findOneBy: jest.fn(),
  };
  const shopRepository: jest.Mocked<Pick<Repository<Shop>, 'findOneBy'>> = {
    findOneBy: jest.fn(),
  };
  const shopMemberRepository: jest.Mocked<
    Pick<Repository<ShopMember>, 'find' | 'findOneBy'>
  > = {
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
  const service = new ProductService(
    productRepository as unknown as Repository<Product>,
    categoryRepository as unknown as Repository<Category>,
    shopRepository as unknown as Repository<Shop>,
    shopMemberRepository as unknown as Repository<ShopMember>,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('only returns an active product from the public lookup', async () => {
    const activeProduct = { ...product, status: ProductStatus.ACTIVE };
    productRepository.findOne.mockResolvedValueOnce(activeProduct);

    await expect(service.findOne(productId)).resolves.toBe(activeProduct);
    expect(productRepository.findOne).toHaveBeenCalledWith({
      where: { id: productId, status: ProductStatus.ACTIVE },
      relations: { category: true, seller: true, shop: true },
    });
  });

  it('creates a personal product as a draft with normalized text', async () => {
    const unsavedProduct = { ...product };
    categoryRepository.findOneBy.mockResolvedValueOnce(category);
    productRepository.create.mockReturnValueOnce(unsavedProduct);
    productRepository.save.mockResolvedValueOnce(unsavedProduct);
    productRepository.findOne.mockResolvedValueOnce(product);

    await expect(
      service.create(sellerId, {
        categoryId,
        title: '  Áo khoác denim  ',
        description: '   ',
        condition: ProductCondition.GOOD,
        size: ' M ',
        price: 250000,
      }),
    ).resolves.toBe(product);
    expect(productRepository.create).toHaveBeenCalledWith({
      categoryId,
      sellerUserId: sellerId,
      shopId: null,
      title: 'Áo khoác denim',
      description: null,
      condition: ProductCondition.GOOD,
      size: 'M',
      color: null,
      brand: null,
      price: 250000,
      status: ProductStatus.DRAFT,
      publishedAt: null,
      heldUntil: null,
      soldAt: null,
    });
  });

  it('requires an active owner to create a product for a shop', async () => {
    categoryRepository.findOneBy.mockResolvedValueOnce(category);
    shopRepository.findOneBy.mockResolvedValueOnce({
      id: shopId,
      status: ShopStatus.ACTIVE,
    } as Shop);
    shopMemberRepository.findOneBy.mockResolvedValueOnce(null);

    await expect(
      service.create(otherUserId, {
        categoryId,
        shopId,
        title: 'Áo khoác denim',
        condition: ProductCondition.GOOD,
        price: 250000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(productRepository.save).not.toHaveBeenCalled();
  });

  it('publishes a draft owned by the current user', async () => {
    const draft = { ...product };
    const activeProduct = { ...product, status: ProductStatus.ACTIVE };
    productRepository.findOne
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(activeProduct);
    categoryRepository.findOneBy.mockResolvedValueOnce(category);
    productRepository.save.mockResolvedValueOnce(draft);

    await expect(
      service.updateStatus(productId, sellerId, {
        status: ProductStatus.ACTIVE,
      }),
    ).resolves.toBe(activeProduct);
    expect(draft.status).toBe(ProductStatus.ACTIVE);
    expect(draft.publishedAt).toBeInstanceOf(Date);
    expect(productRepository.save).toHaveBeenCalledWith(draft);
  });

  it('rejects reactivating a sold product', async () => {
    productRepository.findOne.mockResolvedValueOnce({
      ...product,
      status: ProductStatus.SOLD,
      soldAt: new Date('2026-10-18T01:00:00.000Z'),
    });

    await expect(
      service.updateStatus(productId, sellerId, {
        status: ProductStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(productRepository.save).not.toHaveBeenCalled();
  });
});
