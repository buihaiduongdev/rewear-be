import type { DataSource, Repository } from 'typeorm';

import { CartAvailability } from '@/modules/cart/enums/cart-availability.enum';
import { MediaLink } from '@/modules/media/entities';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
import { WishlistItem } from '@/modules/wishlist/entities';
import { WishlistService } from '@/modules/wishlist/wishlist.service';

describe('WishlistService', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const productId = '22222222-2222-2222-2222-222222222222';

  const mockWishlistRepo: jest.Mocked<
    Pick<Repository<WishlistItem>, 'find' | 'delete'>
  > = {
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockProductRepo: jest.Mocked<Pick<Repository<Product>, 'findOneBy'>> = {
    findOneBy: jest.fn(),
  };

  const mockMediaRepo: jest.Mocked<Pick<Repository<MediaLink>, 'find'>> = {
    find: jest.fn(),
  };

  const mockQueryBuilder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };

  const mockDataSource = {
    getRepository: jest.fn((entity) => {
      if (entity === WishlistItem) return mockWishlistRepo;
      if (entity === Product) return mockProductRepo;
      if (entity === MediaLink) return mockMediaRepo;
      throw new Error(`Unexpected entity: ${entity}`);
    }),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  } as unknown as DataSource;

  let service: WishlistService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WishlistService(mockDataSource);
  });

  describe('findMine', () => {
    it('returns empty list when user has no wishlist items', async () => {
      mockWishlistRepo.find.mockResolvedValueOnce([]);

      const result = await service.findMine(userId);

      expect(result).toEqual({ items: [], totalCount: 0 });
      expect(mockWishlistRepo.find).toHaveBeenCalledWith({
        where: { userId },
        relations: { product: { shop: true, category: true } },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns formatted wishlist items with availability and cover image', async () => {
      const mockProduct = {
        id: productId,
        title: 'Áo khoác dạ',
        price: 250000,
        condition: ProductCondition.GOOD,
        status: ProductStatus.ACTIVE,
        size: 'L',
        color: 'Beige',
        shop: { id: 'shop-1', name: 'Vintage Shop' },
      } as unknown as Product;

      const mockWishlistItem = {
        id: 'item-1',
        userId,
        productId,
        product: mockProduct,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      } as WishlistItem;

      mockWishlistRepo.find.mockResolvedValueOnce([mockWishlistItem]);
      mockMediaRepo.find.mockResolvedValueOnce([
        {
          ownerId: productId,
          media: { url: 'https://cdn.example.com/cover.jpg' },
        } as MediaLink,
      ]);

      const result = await service.findMine(userId);

      expect(result.totalCount).toBe(1);
      expect(result.items[0]).toEqual({
        id: 'item-1',
        productId,
        addedAt: mockWishlistItem.createdAt,
        availability: CartAvailability.AVAILABLE,
        product: {
          id: productId,
          title: 'Áo khoác dạ',
          price: 250000,
          condition: ProductCondition.GOOD,
          size: 'L',
          color: 'Beige',
          coverUrl: 'https://cdn.example.com/cover.jpg',
          shop: { id: 'shop-1', name: 'Vintage Shop', logoUrl: null },
        },
      });
    });
  });

  describe('add', () => {
    it('adds product to wishlist and returns updated list', async () => {
      mockProductRepo.findOneBy.mockResolvedValueOnce({
        id: productId,
      } as Product);
      mockWishlistRepo.find.mockResolvedValueOnce([]);

      const result = await service.add(userId, productId);

      expect(mockProductRepo.findOneBy).toHaveBeenCalledWith({ id: productId });
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(result).toEqual({ items: [], totalCount: 0 });
    });

    it('throws NotFoundException when product does not exist', async () => {
      mockProductRepo.findOneBy.mockResolvedValueOnce(null);

      await expect(service.add(userId, productId)).rejects.toThrow(
        'Product not found',
      );
    });
  });

  describe('remove', () => {
    it('removes item from wishlist and returns updated list', async () => {
      mockWishlistRepo.delete.mockResolvedValueOnce({ raw: [], affected: 1 });
      mockWishlistRepo.find.mockResolvedValueOnce([]);

      const result = await service.remove(userId, productId);

      expect(mockWishlistRepo.delete).toHaveBeenCalledWith({
        userId,
        productId,
      });
      expect(result).toEqual({ items: [], totalCount: 0 });
    });
  });
});
