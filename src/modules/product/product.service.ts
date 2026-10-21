import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';

import { IPaginatedResult, paginate } from '@/common/pagination';
import { Category } from '@/modules/category/entities';
import { Shop, ShopMember } from '@/modules/shop/entities';
import {
  ShopMemberRole,
  ShopMemberStatus,
  ShopStatus,
} from '@/modules/shop/enums';

import { Product } from './entities';
import { ProductStatus } from './enums';
import { FindMyProductQuery, FindProductQuery } from './schemas';
import type {
  CreateProductInput,
  UpdateProductInput,
  UpdateProductStatusInput,
} from './schemas/product-input.schema';

const PRODUCT_RELATIONS = {
  category: true,
  seller: true,
  shop: true,
} as const;

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(ShopMember)
    private readonly shopMemberRepository: Repository<ShopMember>,
  ) {}

  findAll(query: FindProductQuery): Promise<IPaginatedResult<Product>> {
    const queryBuilder = this.createProductQueryBuilder().where(
      'product.status = :status',
      { status: ProductStatus.ACTIVE },
    );
    this.applyFilters(queryBuilder, query);
    return this.paginateProducts(queryBuilder, query);
  }

  async findMine(
    currentUserId: string,
    query: FindMyProductQuery,
  ): Promise<IPaginatedResult<Product>> {
    const ownedShops = await this.shopMemberRepository.find({
      where: {
        userId: currentUserId,
        memberRole: ShopMemberRole.OWNER,
        status: ShopMemberStatus.ACTIVE,
      },
      select: { shopId: true },
    });
    const ownedShopIds = ownedShops.map(({ shopId }) => shopId);
    const queryBuilder = this.createProductQueryBuilder().where(
      new Brackets((scope) => {
        scope.where('product.sellerUserId = :currentUserId', {
          currentUserId,
        });
        if (ownedShopIds.length > 0) {
          scope.orWhere('product.shopId IN (:...ownedShopIds)', {
            ownedShopIds,
          });
        }
      }),
    );
    if (query.status) {
      queryBuilder.andWhere('product.status = :status', {
        status: query.status,
      });
    }
    this.applyFilters(queryBuilder, query);
    return this.paginateProducts(queryBuilder, query);
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id, status: ProductStatus.ACTIVE },
      relations: PRODUCT_RELATIONS,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findOneForManagement(
    id: string,
    currentUserId: string,
  ): Promise<Product> {
    const product = await this.findManagedProduct(id);
    await this.assertCanManage(product, currentUserId);
    return product;
  }

  async create(
    currentUserId: string,
    input: CreateProductInput,
  ): Promise<Product> {
    await this.assertActiveCategory(input.categoryId);
    if (input.shopId) {
      await this.assertActiveShopOwner(input.shopId, currentUserId);
    }

    const product = await this.productRepository.save(
      this.productRepository.create({
        categoryId: input.categoryId,
        sellerUserId: input.shopId ? null : currentUserId,
        shopId: input.shopId ?? null,
        title: input.title.trim(),
        description: this.normalizeOptionalText(input.description),
        condition: input.condition,
        size: this.normalizeOptionalText(input.size),
        color: this.normalizeOptionalText(input.color),
        brand: this.normalizeOptionalText(input.brand),
        price: input.price,
        status: ProductStatus.DRAFT,
        publishedAt: null,
        heldUntil: null,
        soldAt: null,
      }),
    );
    return this.findManagedProduct(product.id);
  }

  async update(
    id: string,
    currentUserId: string,
    input: UpdateProductInput,
  ): Promise<Product> {
    const product = await this.findOneForManagement(id, currentUserId);
    if (
      input.categoryId !== undefined &&
      input.categoryId !== product.categoryId
    ) {
      await this.assertActiveCategory(input.categoryId);
      product.categoryId = input.categoryId;
    }
    if (input.title !== undefined) product.title = input.title.trim();
    if (input.description !== undefined) {
      product.description = this.normalizeOptionalText(input.description);
    }
    if (input.condition !== undefined) product.condition = input.condition;
    if (input.size !== undefined) {
      product.size = this.normalizeOptionalText(input.size);
    }
    if (input.color !== undefined) {
      product.color = this.normalizeOptionalText(input.color);
    }
    if (input.brand !== undefined) {
      product.brand = this.normalizeOptionalText(input.brand);
    }
    if (input.price !== undefined) product.price = input.price;

    await this.productRepository.save(product);
    return this.findManagedProduct(product.id);
  }

  async updateStatus(
    id: string,
    currentUserId: string,
    input: UpdateProductStatusInput,
  ): Promise<Product> {
    const product = await this.findOneForManagement(id, currentUserId);
    if (product.status === input.status) return product;
    this.assertStatusTransition(product.status, input.status);

    if (input.status === ProductStatus.ACTIVE) {
      await this.assertActiveCategory(product.categoryId);
      if (product.shopId) {
        await this.assertActiveShop(product.shopId);
      }
      product.publishedAt ??= new Date();
      product.heldUntil = null;
    }
    if (input.status === ProductStatus.HIDDEN) product.heldUntil = null;
    if (input.status === ProductStatus.SOLD) {
      product.soldAt = new Date();
      product.heldUntil = null;
    }
    product.status = input.status;

    await this.productRepository.save(product);
    return this.findManagedProduct(product.id);
  }

  private createProductQueryBuilder(): SelectQueryBuilder<Product> {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.seller', 'seller')
      .leftJoinAndSelect('product.shop', 'shop');
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<Product>,
    query: FindProductQuery | FindMyProductQuery,
  ): void {
    if (query.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.shopId) {
      queryBuilder.andWhere('product.shopId = :shopId', {
        shopId: query.shopId,
      });
    }
    if (query.sellerUserId) {
      queryBuilder.andWhere('product.sellerUserId = :sellerUserId', {
        sellerUserId: query.sellerUserId,
      });
    }
    if (query.condition) {
      queryBuilder.andWhere('product.condition = :condition', {
        condition: query.condition,
      });
    }
    if (query.minPrice !== undefined) {
      queryBuilder.andWhere('product.price >= :minPrice', {
        minPrice: query.minPrice,
      });
    }
    if (query.maxPrice !== undefined) {
      queryBuilder.andWhere('product.price <= :maxPrice', {
        maxPrice: query.maxPrice,
      });
    }
    if (query.search) {
      queryBuilder.andWhere(
        new Brackets((search) => {
          search
            .where('product.title ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('product.description ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('product.brand ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }
  }

  private paginateProducts(
    queryBuilder: SelectQueryBuilder<Product>,
    query: FindProductQuery | FindMyProductQuery,
  ): Promise<IPaginatedResult<Product>> {
    return paginate(queryBuilder, query, {
      allowedSorts: {
        createdAt: 'product.createdAt',
        price: 'product.price',
        publishedAt: 'product.publishedAt',
      },
      defaultSort: 'product.createdAt',
    });
  }

  private async findManagedProduct(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: PRODUCT_RELATIONS,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async assertCanManage(
    product: Product,
    currentUserId: string,
  ): Promise<void> {
    if (product.sellerUserId === currentUserId) return;
    if (product.shopId) {
      await this.assertOwner(product.shopId, currentUserId);
      return;
    }
    throw new ForbiddenException('Product owner access required');
  }

  private async assertActiveCategory(categoryId: string): Promise<void> {
    if (
      !(await this.categoryRepository.findOneBy({
        id: categoryId,
        isActive: true,
      }))
    ) {
      throw new NotFoundException('Category not found');
    }
  }

  private async assertActiveShopOwner(
    shopId: string,
    currentUserId: string,
  ): Promise<void> {
    await this.assertActiveShop(shopId);
    await this.assertOwner(shopId, currentUserId);
  }

  private async assertActiveShop(shopId: string): Promise<void> {
    const shop = await this.shopRepository.findOneBy({ id: shopId });
    if (!shop) throw new NotFoundException('Shop not found');
    if (shop.status !== ShopStatus.ACTIVE) {
      throw new BadRequestException('Shop is not active');
    }
  }

  private async assertOwner(shopId: string, userId: string): Promise<void> {
    const owner = await this.shopMemberRepository.findOneBy({
      shopId,
      userId,
      memberRole: ShopMemberRole.OWNER,
      status: ShopMemberStatus.ACTIVE,
    });
    if (!owner) throw new ForbiddenException('Shop owner access required');
  }

  private assertStatusTransition(
    currentStatus: ProductStatus,
    nextStatus: ProductStatus,
  ): void {
    const transitions: Record<ProductStatus, readonly ProductStatus[]> = {
      [ProductStatus.DRAFT]: [ProductStatus.ACTIVE],
      [ProductStatus.ACTIVE]: [ProductStatus.HIDDEN, ProductStatus.SOLD],
      [ProductStatus.HELD]: [ProductStatus.ACTIVE, ProductStatus.SOLD],
      [ProductStatus.HIDDEN]: [ProductStatus.ACTIVE],
      [ProductStatus.SOLD]: [],
    };
    if (!transitions[currentStatus].includes(nextStatus)) {
      throw new BadRequestException('Invalid product status transition');
    }
  }

  private normalizeOptionalText(value?: string | null): string | null {
    return value?.trim() || null;
  }
}
