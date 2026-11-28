import { isDeepStrictEqual } from 'node:util';

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { paginate, type Paginated, type PaginateQuery } from 'nestjs-paginate';
import {
  DataSource,
  EntityManager,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { Category } from '@/modules/category/entities';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { ProductMedia } from '@/modules/media/entities';
import { MediaRole } from '@/modules/media/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/constants/shop-application.constant';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { Product, ProductModeration } from './entities';
import { ProductModerationStatus, ProductStatus } from './enums';
import { PRODUCT_PAGINATION_CONFIG } from './pagination.config';
import { suspendProductForModeration } from './policies/suspend-product.policy';
import type {
  CreateProductInput,
  ModerateProductInput,
  SuspendProductInput,
  UpdateProductInput,
  UpdateProductStatusInput,
} from './schemas/product-input.schema';

type ProductView = Product & { coverUrl: string | null; mediaCount: number };

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
    private readonly dataSource: DataSource,
    private readonly authorizationService: AuthorizationService,
    private readonly storage: StorageService,
    private readonly outboxService: OutboxService,
  ) {}

  findAll(
    query: PaginateQuery,
    provinceId?: number,
  ): Promise<Paginated<ProductView>> {
    const queryBuilder = this.createProductQueryBuilder()
      .where('product.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere('category.isActive = true')
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      });

    if (provinceId !== undefined) {
      queryBuilder.innerJoin(
        PickupLocation,
        'pickupLocation',
        'pickupLocation.shopId = product.shopId AND pickupLocation.provinceId = :provinceId',
        { provinceId },
      );
    }

    return this.paginateProducts(queryBuilder, query);
  }

  async findMine(
    currentUserId: string,
    query: PaginateQuery,
  ): Promise<Paginated<ProductView>> {
    const memberships = await this.shopMemberRepository.find({
      where: {
        userId: currentUserId,
      },
      select: { shopId: true },
    });
    const authorized = await Promise.all(
      memberships.map(async ({ shopId }) => ({
        shopId,
        allowed: await this.authorizationService.hasPermission(
          currentUserId,
          shopId,
          SHOP_PERMISSIONS.PRODUCT_VIEW,
        ),
      })),
    );
    const ownedShopIds = authorized
      .filter(({ allowed }) => allowed)
      .map(({ shopId }) => shopId);
    const queryBuilder = this.createProductQueryBuilder().where(
      ownedShopIds.length ? 'product.shopId IN (:...ownedShopIds)' : '1 = 0',
      ownedShopIds.length ? { ownedShopIds } : {},
    );
    return this.paginateProducts(queryBuilder, query);
  }

  async findOne(id: string): Promise<ProductView> {
    const product = await this.createProductQueryBuilder()
      .where('product.id = :id AND product.status = :status', {
        id,
        status: ProductStatus.ACTIVE,
      })
      .andWhere('category.isActive = true')
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      })
      .getOneOrFail();
    const [view] = await this.loadMedia([product]);
    return view;
  }

  async create(
    currentUserId: string,
    input: CreateProductInput,
  ): Promise<ProductView> {
    if (input.categoryId) await this.assertActiveCategory(input.categoryId);
    const product = await this.dataSource.transaction(async (manager) => {
      await this.assertActiveShop(input.shopId, manager);
      return manager.getRepository(Product).save(
        manager.getRepository(Product).create({
          categoryId: input.categoryId ?? null,
          shopId: input.shopId,
          title: this.normalizeOptionalText(input.title),
          description: this.normalizeOptionalText(input.description),
          condition: input.condition ?? null,
          size: this.normalizeOptionalText(input.size),
          color: this.normalizeOptionalText(input.color),
          brand: this.normalizeOptionalText(input.brand),
          price: input.price ?? null,
          measurements: input.measurements ?? {},
          shippingPackage: input.shippingPackage ?? null,
          repairs: this.normalizeOptionalText(input.repairs),
          defects: input.defects ?? [],
          status: ProductStatus.DRAFT,
          publishedAt: null,
          heldUntil: null,
          soldAt: null,
        }),
      );
    });
    return this.findManagedProduct(product.id);
  }

  assertEditable(product: Product): void {
    const productIsNotEditable = [
      ProductStatus.HELD,
      ProductStatus.SOLD,
      ProductStatus.SUSPENDED,
      ProductStatus.PENDING_REVIEW,
    ].includes(product.status);
    if (productIsNotEditable) {
      throw new ConflictException(
        'This product cannot be edited in its current state',
      );
    }
  }

  async markContentChanged(
    manager: EntityManager,
    product: Product,
  ): Promise<void> {
    this.assertEditable(product);
    await manager.update(
      ProductModeration,
      { productId: product.id },
      { status: ProductModerationStatus.DRAFT, reason: null },
    );
    product.status = ProductStatus.DRAFT;
    await manager.save(Product, product);
  }

  async update(
    id: string,
    currentUserId: string,
    input: UpdateProductInput,
    shopId?: string,
  ): Promise<ProductView> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockProduct(manager, id, shopId);
      this.assertEditable(product);
      if (input.categoryId)
        await this.assertActiveCategory(input.categoryId, manager);
      const isPublished = [ProductStatus.ACTIVE, ProductStatus.HIDDEN].includes(
        product.status,
      );
      const contentChanged = this.applyContentChanges(product, input);
      let priceChanged = false;
      if (input.price !== undefined && product.price !== input.price) {
        if (isPublished && (!input.price || input.price <= 0)) {
          throw new BadRequestException(
            'A published product must have a positive price',
          );
        }
        product.price = input.price;
        priceChanged = true;
      }
      if (!contentChanged && !priceChanged) return;
      // Any content or price edit on a published listing hides it for admin re-approval.
      if (isPublished) {
        const missingRequired =
          !product.title ||
          !product.categoryId ||
          !product.condition ||
          !product.description?.trim() ||
          !product.price ||
          product.price <= 0;
        if (missingRequired) {
          throw new BadRequestException(
            'Title, category, condition, description and a positive price are required',
          );
        }
        await this.queueForReview(manager, product);
        return;
      }
      await this.markContentChanged(manager, product);
    });
    return this.findManagedProduct(id);
  }

  private applyContentChanges(
    product: Product,
    input: UpdateProductInput,
  ): boolean {
    let contentChanged = false;
    const textFields = [
      'title',
      'description',
      'size',
      'color',
      'brand',
      'repairs',
    ] as const;
    for (const field of textFields) {
      if (input[field] !== undefined) {
        const value = this.normalizeOptionalText(input[field]);
        if (product[field] !== value) {
          product[field] = value;
          contentChanged = true;
        }
      }
    }
    if (
      input.categoryId !== undefined &&
      product.categoryId !== input.categoryId
    ) {
      product.categoryId = input.categoryId;
      contentChanged = true;
    }
    if (
      input.condition !== undefined &&
      product.condition !== input.condition
    ) {
      product.condition = input.condition;
      contentChanged = true;
    }
    if (
      input.measurements !== undefined &&
      !isDeepStrictEqual(product.measurements, input.measurements)
    ) {
      product.measurements = input.measurements;
      contentChanged = true;
    }
    if (
      input.defects !== undefined &&
      !isDeepStrictEqual(product.defects, input.defects)
    ) {
      product.defects = input.defects;
      contentChanged = true;
    }
    if (
      input.shippingPackage !== undefined &&
      !isDeepStrictEqual(product.shippingPackage ?? null, input.shippingPackage)
    ) {
      product.shippingPackage = input.shippingPackage;
      contentChanged = true;
    }
    return contentChanged;
  }

  async updateStatus(
    id: string,
    userId: string,
    input: UpdateProductStatusInput,
    shopId?: string,
  ): Promise<ProductView> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockProduct(manager, id, shopId);
      if (
        ![ProductStatus.ACTIVE, ProductStatus.HIDDEN].includes(product.status)
      ) {
        throw new ConflictException(
          'Only an approved listing can be hidden or reactivated',
        );
      }
      if (input.status === ProductStatus.ACTIVE)
        await this.validateForPublication(manager, product);
      product.status = input.status;
      await manager.save(Product, product);
    });
    return this.findManagedProduct(id);
  }

  async submit(id: string, shopId?: string): Promise<ProductView> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockProduct(manager, id, shopId);
      if (product.status !== ProductStatus.DRAFT)
        throw new ConflictException('Only a draft can be submitted');
      await this.validateForPublication(manager, product);
      await this.queueForReview(manager, product);
    });
    return this.findManagedProduct(id);
  }

  private async queueForReview(
    manager: EntityManager,
    product: Product,
  ): Promise<void> {
    const moderation = await manager.findOneBy(ProductModeration, {
      productId: product.id,
    });
    if (moderation) {
      moderation.version += 1;
      moderation.status = ProductModerationStatus.PENDING;
      moderation.reason = null;
      await manager.save(ProductModeration, moderation);
    } else {
      await manager.save(
        ProductModeration,
        manager.create(ProductModeration, {
          productId: product.id,
          version: 1,
          status: ProductModerationStatus.PENDING,
          reason: null,
        }),
      );
    }
    product.status = ProductStatus.PENDING_REVIEW;
    await manager.save(Product, product);
  }

  async cancelSubmission(id: string, shopId?: string): Promise<ProductView> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockProduct(manager, id, shopId);
      if (product.status !== ProductStatus.PENDING_REVIEW) {
        throw new ConflictException(
          'Only a pending submission can be cancelled',
        );
      }
      await manager.update(
        ProductModeration,
        { productId: id },
        { status: ProductModerationStatus.CANCELLED },
      );
      product.status = ProductStatus.DRAFT;
      await manager.save(Product, product);
    });
    return this.findManagedProduct(id);
  }

  async moderate(
    id: string,
    adminId: string,
    input: ModerateProductInput,
  ): Promise<ProductView> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockProduct(manager, id);
      const moderation = await manager.findOneByOrFail(ProductModeration, {
        productId: id,
      });
      const reviewIsStale =
        product.status !== ProductStatus.PENDING_REVIEW ||
        moderation.status !== ProductModerationStatus.PENDING ||
        moderation.version !== input.version;
      if (reviewIsStale) {
        throw new ConflictException(
          'The submitted review is no longer current',
        );
      }
      if (input.decision === 'APPROVE') {
        await this.validateForPublication(manager, product);
        product.status = ProductStatus.ACTIVE;
        product.publishedAt ??= new Date();
      } else {
        if (!input.reason?.trim())
          throw new BadRequestException('A rejection reason is required');
        product.status = ProductStatus.REJECTED;
      }
      moderation.status =
        input.decision === 'REJECT'
          ? ProductModerationStatus.REJECTED
          : ProductModerationStatus.APPROVED;
      moderation.reason =
        input.decision === 'REJECT' ? input.reason!.trim() : null;
      await manager.save(ProductModeration, moderation);
      await manager.save(Product, product);
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.PRODUCT_REVIEW_DECIDED,
        resourceId: product.id,
        payload: {
          productId: product.id,
          shopId: product.shopId,
          moderationId: moderation.id,
          version: moderation.version,
          status: moderation.status,
        },
      });
    });
    return this.findManagedProduct(id);
  }

  async suspend(
    id: string,
    adminId: string,
    { reason }: SuspendProductInput,
  ): Promise<ProductView> {
    await this.dataSource.transaction(async (manager) => {
      await suspendProductForModeration(manager, id, reason);
    });
    return this.findManagedProduct(id);
  }

  async findModeration(
    id: string,
    shopId?: string,
  ): Promise<ProductModeration> {
    if (shopId) {
      await this.productRepository.findOneByOrFail({ id, shopId });
    }
    return this.dataSource
      .getRepository(ProductModeration)
      .findOneByOrFail({ productId: id });
  }

  async findForReview(id: string): Promise<ProductView> {
    await this.dataSource
      .getRepository(ProductModeration)
      .findOneByOrFail({ productId: id });
    return this.findManagedProduct(id);
  }

  async findReviewQueue(query: PaginateQuery): Promise<Paginated<ProductView>> {
    const builder = this.createProductQueryBuilder().innerJoin(
      ProductModeration,
      'moderation',
      'moderation.productId = product.id',
    );
    if (!query.filter?.status) {
      builder.where('product.status = :status', {
        status: ProductStatus.PENDING_REVIEW,
      });
    }
    return this.paginateProducts(builder, query);
  }

  lockProduct(
    manager: EntityManager,
    id: string,
    shopId?: string,
  ): Promise<Product> {
    return manager.findOneOrFail(Product, {
      where: shopId ? { id, shopId } : { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async validateForPublication(
    manager: EntityManager,
    product: Product,
  ): Promise<void> {
    const categoryId = product.categoryId;
    const publicationDetailsAreMissing =
      !product.title ||
      !categoryId ||
      !product.condition ||
      !product.description?.trim() ||
      !product.price ||
      product.price <= 0;
    if (publicationDetailsAreMissing) {
      throw new BadRequestException(
        'Title, category, condition, description and a positive price are required',
      );
    }
    const category = await this.assertActiveCategory(categoryId, manager);
    const requiredMeasurementsAreMissing = category.requiredMeasurements.some(
      (key) => !product.measurements[key] || product.measurements[key] <= 0,
    );
    if (requiredMeasurementsAreMissing) {
      throw new BadRequestException(
        'Required category measurements are missing',
      );
    }
    await this.assertActiveShop(product.shopId, manager);
    const links = await this.getMedia(manager, product.id);
    if (links.length < 3 || !links.some((link) => link.role === 'COVER')) {
      throw new BadRequestException(
        'At least three images and a cover are required',
      );
    }
    if (links.some((link) => !link.angle))
      throw new BadRequestException('Every image must declare its angle');
    const angles = new Set(links.map((link) => link.angle));
    if (!angles.has('FRONT') || !angles.has('BACK'))
      throw new BadRequestException('Front and back images are required');
    const ids = new Set(links.map((link) => link.mediaId));
    const defectImagesAreInvalid = product.defects.some(
      (defect) =>
        !defect.mediaIds.length || defect.mediaIds.some((id) => !ids.has(id)),
    );
    if (defectImagesAreInvalid) {
      throw new BadRequestException(
        'Every defect must reference images attached to this product',
      );
    }
  }

  private getMedia(
    manager: EntityManager,
    productId: string,
  ): Promise<ProductMedia[]> {
    return manager.find(ProductMedia, {
      where: { productId },
      relations: { media: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findPublishedMedia(product: Product): Promise<ProductMedia[]> {
    await this.createProductQueryBuilder()
      .where('product.id = :id AND product.status = :status', {
        id: product.id,
        status: ProductStatus.ACTIVE,
      })
      .andWhere('category.isActive = true')
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      })
      .getOneOrFail();
    return this.getMedia(this.dataSource.manager, product.id);
  }

  private async loadMedia(
    products: Product[],
    manager = this.dataSource.manager,
  ): Promise<ProductView[]> {
    if (!products.length) return [];
    const links = await manager.getRepository(ProductMedia).find({
      where: {
        productId: In(products.map((product) => product.id)),
      },
      relations: { media: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const byProduct = new Map<string, ProductMedia[]>();
    for (const link of links) {
      const group = byProduct.get(link.productId) ?? [];
      group.push(link);
      byProduct.set(link.productId, group);
    }
    return products.map((product) => {
      const mediaLinks = byProduct.get(product.id) ?? [];
      const cover = mediaLinks.find((link) => link.role === MediaRole.COVER);
      return {
        ...product,
        shop: product.shop
          ? {
              ...product.shop,
              logoUrl: product.shop.logoMedia
                ? this.storage.getPublicUrl(product.shop.logoMedia.storageKey)
                : null,
              identitySalesPaused: !shopAllowsIdentitySales(product.shop),
            }
          : product.shop,
        coverUrl: cover
          ? this.storage.getPublicUrl(cover.media.storageKey)
          : null,
        mediaCount: mediaLinks.length,
      };
    });
  }

  private createProductQueryBuilder(
    manager?: EntityManager,
  ): SelectQueryBuilder<Product> {
    return (manager?.getRepository(Product) ?? this.productRepository)
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.shop', 'shop')
      .leftJoinAndSelect('shop.logoMedia', 'shopLogo');
  }

  private async paginateProducts(
    queryBuilder: SelectQueryBuilder<Product>,
    query: PaginateQuery,
    manager?: EntityManager,
  ): Promise<Paginated<ProductView>> {
    const result = await paginate(
      query,
      queryBuilder,
      PRODUCT_PAGINATION_CONFIG,
    );
    const data = await this.loadMedia(result.data, manager);
    return { ...result, data };
  }

  async findManagedProduct(id: string, shopId?: string): Promise<ProductView> {
    const product = await this.productRepository.findOneOrFail({
      where: shopId ? { id, shopId } : { id },
      relations: { category: true, shop: { logoMedia: true } },
    });
    const [view] = await this.loadMedia([product]);
    return view;
  }

  private assertActiveCategory(
    categoryId: string,
    manager?: EntityManager,
  ): Promise<Category> {
    return (
      manager?.getRepository(Category) ?? this.categoryRepository
    ).findOneByOrFail({ id: categoryId, isActive: true });
  }

  private async assertActiveShop(
    shopId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const shop = await (
      manager?.getRepository(Shop) ?? this.shopRepository
    ).findOneByOrFail({ id: shopId });
    const [{ now }] = manager
      ? await manager.query('SELECT clock_timestamp() AS now')
      : [{ now: new Date() }];
    if (
      shop.status !== ShopStatus.ACTIVE ||
      !shopAllowsIdentitySales(shop, new Date(now))
    ) {
      throw new BadRequestException('Shop is not active');
    }
  }

  private normalizeOptionalText(value?: string | null): string | null {
    return value?.trim() || null;
  }
}
