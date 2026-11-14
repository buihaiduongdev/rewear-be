import { isDeepStrictEqual } from 'node:util';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

import { Category } from '@/modules/category/entities';
import { MediaLink } from '@/modules/media/entities';
import { MediaOwnerType } from '@/modules/media/enums';
import { Shop, ShopMember } from '@/modules/shop/entities';
import {
  ShopMemberRole,
  ShopMemberStatus,
  ShopStatus,
} from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { Product, ProductRevision } from './entities';
import { ProductStatus } from './enums';
import { PRODUCT_PAGINATION_CONFIG } from './pagination.config';
import type {
  CreateProductInput,
  ModerateProductInput,
  UpdateProductInput,
  UpdateProductStatusInput,
} from './schemas/product-input.schema';

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
  ) {}

  findAll(query: PaginateQuery): Promise<Paginated<Product>> {
    const queryBuilder = this.createProductQueryBuilder()
      .where('product.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere('product.approvedRevision = product.revision')
      .andWhere('category.isActive = true')
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      });
    return this.paginateProducts(queryBuilder, query, true);
  }

  async findMine(
    currentUserId: string,
    query: PaginateQuery,
  ): Promise<Paginated<Product>> {
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
      ownedShopIds.length ? 'product.shopId IN (:...ownedShopIds)' : '1 = 0',
      ownedShopIds.length ? { ownedShopIds } : {},
    );
    return this.paginateProducts(queryBuilder, query);
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.createProductQueryBuilder()
      .where('product.id = :id AND product.status = :status', {
        id,
        status: ProductStatus.ACTIVE,
      })
      .andWhere('product.approvedRevision = product.revision')
      .andWhere('category.isActive = true')
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      })
      .getOneOrFail();
    await this.loadMedia([product], true);
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
    if (input.categoryId) await this.assertActiveCategory(input.categoryId);
    await this.assertActiveShopOwner(input.shopId, currentUserId);
    const product = await this.productRepository.save(
      this.productRepository.create({
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
        revision: 1,
        approvedRevision: null,
        status: ProductStatus.DRAFT,
        publishedAt: null,
        heldUntil: null,
        soldAt: null,
      }),
    );
    return this.findManagedProduct(product.id);
  }

  // All listing/media changes and review operations lock this same row.
  async lockForManagement(
    manager: EntityManager,
    id: string,
    userId: string,
  ): Promise<Product> {
    const product = await this.lockProduct(manager, id);
    await this.assertCanManage(product, userId, manager);
    return product;
  }

  assertEditable(product: Product): void {
    if (
      [
        ProductStatus.HELD,
        ProductStatus.SOLD,
        ProductStatus.SUSPENDED,
        ProductStatus.PENDING_REVIEW,
      ].includes(product.status)
    ) {
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
    product.revision += 1;
    product.approvedRevision = null;
    product.status = ProductStatus.DRAFT;
    await manager.save(Product, product);
  }

  async update(
    id: string,
    currentUserId: string,
    input: UpdateProductInput,
  ): Promise<Product> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockForManagement(manager, id, currentUserId);
      this.assertEditable(product);
      if (input.categoryId)
        await this.assertActiveCategory(input.categoryId, manager);
      let contentChanged = false;
      let priceChanged = false;
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
      for (const field of ['measurements', 'defects'] as const) {
        if (
          input[field] !== undefined &&
          JSON.stringify(product[field]) !== JSON.stringify(input[field])
        ) {
          if (field === 'measurements')
            product.measurements = input.measurements!;
          else product.defects = input.defects!;
          contentChanged = true;
        }
      }
      if (
        input.shippingPackage !== undefined &&
        !isDeepStrictEqual(
          product.shippingPackage ?? null,
          input.shippingPackage,
        )
      ) {
        product.shippingPackage = input.shippingPackage;
        contentChanged = true;
      }
      if (input.price !== undefined && product.price !== input.price) {
        if (
          [ProductStatus.ACTIVE, ProductStatus.HIDDEN].includes(
            product.status,
          ) &&
          (!input.price || input.price <= 0)
        ) {
          throw new BadRequestException(
            'A published product must have a positive price',
          );
        }
        product.price = input.price;
        priceChanged = true;
      }
      // Changes to draft or rejected content require a new revision.
      if (
        contentChanged ||
        (priceChanged &&
          ![ProductStatus.ACTIVE, ProductStatus.HIDDEN].includes(
            product.status,
          ))
      ) {
        await this.markContentChanged(manager, product);
      } else if (priceChanged) await manager.save(Product, product);
    });
    return this.findManagedProduct(id);
  }

  async updateStatus(
    id: string,
    userId: string,
    input: UpdateProductStatusInput,
  ): Promise<Product> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockForManagement(manager, id, userId);
      if (
        ![ProductStatus.ACTIVE, ProductStatus.HIDDEN].includes(
          product.status,
        ) ||
        product.approvedRevision !== product.revision
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

  async submit(id: string, userId: string): Promise<Product> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockForManagement(manager, id, userId);
      if (product.status !== ProductStatus.DRAFT)
        throw new ConflictException('Only a draft can be submitted');
      await this.validateForPublication(manager, product);
      const links = await this.getMedia(manager, id);
      const revision = await manager.save(
        ProductRevision,
        manager.create(ProductRevision, {
          productId: id,
          revision: product.revision,
          submittedById: userId,
          decision: 'PENDING',
          reviewedById: null,
          reviewedAt: null,
          reason: null,
          snapshot: {
            categoryId: product.categoryId,
            title: product.title,
            description: product.description,
            condition: product.condition,
            size: product.size,
            color: product.color,
            brand: product.brand,
            price: product.price,
            measurements: product.measurements,
            shippingPackage: product.shippingPackage,
            repairs: product.repairs,
            defects: product.defects,
            media: links.map((link) => ({
              mediaId: link.mediaId,
              url: link.media.url,
              storageKey: link.media.storageKey,
              mimeType: link.media.mimeType,
              eTag: link.media.eTag,
              sizeBytes: link.media.sizeBytes,
              role: link.role,
              sortOrder: link.sortOrder,
              angle: link.angle,
            })),
          },
        }),
      );
      // Retain submitted evidence even when the seller later removes an image.
      await manager.save(
        MediaLink,
        links.map((link) =>
          manager.create(MediaLink, {
            mediaId: link.mediaId,
            ownerType: MediaOwnerType.PRODUCT_REVISION,
            ownerId: revision.id,
            role: link.role,
            sortOrder: link.sortOrder,
            angle: link.angle,
          }),
        ),
      );
      product.status = ProductStatus.PENDING_REVIEW;
      await manager.save(Product, product);
    });
    return this.findManagedProduct(id);
  }

  async cancelSubmission(id: string, userId: string): Promise<Product> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lockForManagement(manager, id, userId);
      if (product.status !== ProductStatus.PENDING_REVIEW) {
        throw new ConflictException(
          'Only a pending submission can be cancelled',
        );
      }
      const revision = await manager.findOneByOrFail(ProductRevision, {
        productId: id,
        revision: product.revision,
        decision: 'PENDING',
      });
      revision.decision = 'CANCELLED';
      await manager.save(ProductRevision, revision);
      product.revision += 1;
      product.status = ProductStatus.DRAFT;
      await manager.save(Product, product);
    });
    return this.findManagedProduct(id);
  }

  async moderate(
    id: string,
    adminId: string,
    input: ModerateProductInput,
  ): Promise<Product> {
    await this.dataSource.transaction(async (manager) => {
      await this.assertAdmin(manager, adminId);
      const product = await this.lockProduct(manager, id);
      if (
        product.status !== ProductStatus.PENDING_REVIEW ||
        product.revision !== input.revision
      ) {
        throw new ConflictException(
          'The submitted revision is no longer current',
        );
      }
      const revision = await manager.findOneByOrFail(ProductRevision, {
        productId: id,
        revision: input.revision,
        decision: 'PENDING',
      });
      if (input.decision === 'APPROVE') {
        await this.validateForPublication(manager, product);
        product.status = ProductStatus.ACTIVE;
        product.approvedRevision = product.revision;
        product.publishedAt ??= new Date();
        revision.decision = 'APPROVED';
      } else {
        if (!input.reason?.trim())
          throw new BadRequestException('A rejection reason is required');
        product.status = ProductStatus.REJECTED;
        product.approvedRevision = null;
        revision.decision = 'REJECTED';
      }
      revision.reviewedById = adminId;
      revision.reviewedAt = new Date();
      revision.reason = input.reason?.trim() ?? null;
      await manager.save(ProductRevision, revision);
      await manager.save(Product, product);
    });
    return this.findManagedProduct(id);
  }

  async suspend(id: string, adminId: string, reason: string): Promise<Product> {
    await this.dataSource.transaction(async (manager) => {
      await this.assertAdmin(manager, adminId);
      const product = await this.lockProduct(manager, id);
      if (
        ![ProductStatus.ACTIVE, ProductStatus.HIDDEN].includes(product.status)
      ) {
        throw new ConflictException(
          'Only an available listing can be suspended',
        );
      }
      if (!reason.trim())
        throw new BadRequestException('A suspension reason is required');
      // A separate audit event preserves the original approval decision.
      product.revision += 1;
      await manager.save(
        ProductRevision,
        manager.create(ProductRevision, {
          productId: id,
          revision: product.revision,
          submittedById: adminId,
          snapshot: { action: 'SUSPEND' },
          decision: 'REJECTED',
          reviewedById: adminId,
          reviewedAt: new Date(),
          reason: reason.trim(),
        }),
      );
      product.status = ProductStatus.SUSPENDED;
      product.approvedRevision = null;
      await manager.save(Product, product);
    });
    return this.findManagedProduct(id);
  }

  async findRevisions(
    id: string,
    userId: string,
    admin = false,
  ): Promise<ProductRevision[]> {
    if (admin) await this.assertAdmin(this.dataSource.manager, userId);
    else await this.findOneForManagement(id, userId);
    return this.dataSource
      .getRepository(ProductRevision)
      .find({ where: { productId: id }, order: { revision: 'DESC' } });
  }

  async findForReview(id: string, adminId: string): Promise<Product> {
    await this.assertAdmin(this.dataSource.manager, adminId);
    return this.findManagedProduct(id);
  }

  async findReviewQueue(
    query: PaginateQuery,
    adminId: string,
  ): Promise<Paginated<Product>> {
    await this.assertAdmin(this.dataSource.manager, adminId);
    const builder = this.createProductQueryBuilder();
    if (!query.filter?.status) {
      builder.where('product.status = :status', {
        status: ProductStatus.PENDING_REVIEW,
      });
    }
    return this.paginateProducts(builder, query);
  }

  private async assertAdmin(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    if (
      !(await manager.existsBy(User, {
        id: userId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      }))
    ) {
      throw new ForbiddenException('Admin access required');
    }
  }

  private lockProduct(manager: EntityManager, id: string): Promise<Product> {
    return manager.findOneOrFail(Product, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async validateForPublication(
    manager: EntityManager,
    product: Product,
  ): Promise<void> {
    if (
      !product.title ||
      !product.categoryId ||
      !product.condition ||
      !product.description?.trim() ||
      !product.price ||
      product.price <= 0
    ) {
      throw new BadRequestException(
        'Title, category, condition, description and a positive price are required',
      );
    }
    const category = await this.assertActiveCategory(
      product.categoryId,
      manager,
    );
    if (
      category.requiredMeasurements.some(
        (key) => !product.measurements[key] || product.measurements[key] <= 0,
      )
    ) {
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
    if (
      product.defects.some(
        (defect) =>
          !defect.mediaIds.length || defect.mediaIds.some((id) => !ids.has(id)),
      )
    ) {
      throw new BadRequestException(
        'Every defect must reference images attached to this product',
      );
    }
  }

  private getMedia(
    manager: EntityManager,
    productId: string,
  ): Promise<MediaLink[]> {
    return manager.find(MediaLink, {
      where: { ownerType: MediaOwnerType.PRODUCT, ownerId: productId },
      relations: { media: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findPublishedMedia(product: Product): Promise<MediaLink[]> {
    const revision = await this.dataSource
      .getRepository(ProductRevision)
      .findOneBy({
        productId: product.id,
        revision: product.approvedRevision!,
        decision: 'APPROVED',
      });
    if (!revision) return [];
    return this.dataSource.getRepository(MediaLink).find({
      where: {
        ownerType: MediaOwnerType.PRODUCT_REVISION,
        ownerId: revision.id,
      },
      relations: { media: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  private async loadMedia(
    products: Product[],
    published = false,
  ): Promise<void> {
    if (!products.length) return;
    const revisions = published
      ? await this.dataSource.getRepository(ProductRevision).find({
          where: products.map((product) => ({
            productId: product.id,
            revision: product.approvedRevision!,
            decision: 'APPROVED' as const,
          })),
        })
      : [];
    const productByRevision = new Map(
      revisions.map((revision) => [revision.id, revision.productId]),
    );
    if (published && !revisions.length) {
      for (const product of products) product.mediaLinks = [];
      return;
    }
    const links = await this.dataSource.getRepository(MediaLink).find({
      where: {
        ownerType: published
          ? MediaOwnerType.PRODUCT_REVISION
          : MediaOwnerType.PRODUCT,
        ownerId: In(
          published
            ? revisions.map((revision) => revision.id)
            : products.map((product) => product.id),
        ),
      },
      relations: { media: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const byProduct = new Map<string, MediaLink[]>();
    for (const link of links) {
      const productId = published
        ? productByRevision.get(link.ownerId)!
        : link.ownerId;
      const group = byProduct.get(productId) ?? [];
      group.push(link);
      byProduct.set(productId, group);
    }
    for (const product of products)
      product.mediaLinks = byProduct.get(product.id) ?? [];
  }

  private createProductQueryBuilder(): SelectQueryBuilder<Product> {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.shop', 'shop');
  }

  private async paginateProducts(
    queryBuilder: SelectQueryBuilder<Product>,
    query: PaginateQuery,
    published = false,
  ): Promise<Paginated<Product>> {
    const result = await paginate(
      query,
      queryBuilder,
      PRODUCT_PAGINATION_CONFIG,
    );
    await this.loadMedia(result.data, published);
    return result;
  }

  private async findManagedProduct(id: string): Promise<Product> {
    const product = await this.productRepository.findOneOrFail({
      where: { id },
      relations: { category: true, shop: true },
    });
    await this.loadMedia([product]);
    return product;
  }

  private async assertCanManage(
    product: Product,
    currentUserId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.assertOwner(product.shopId, currentUserId, manager);
  }

  private assertActiveCategory(
    categoryId: string,
    manager?: EntityManager,
  ): Promise<Category> {
    return (
      manager?.getRepository(Category) ?? this.categoryRepository
    ).findOneByOrFail({ id: categoryId, isActive: true });
  }

  private async assertActiveShopOwner(
    shopId: string,
    currentUserId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.assertActiveShop(shopId, manager);
    await this.assertOwner(shopId, currentUserId, manager);
  }

  private async assertActiveShop(
    shopId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const shop = await (
      manager?.getRepository(Shop) ?? this.shopRepository
    ).findOneByOrFail({ id: shopId });
    if (shop.status !== ShopStatus.ACTIVE) {
      throw new BadRequestException('Shop is not active');
    }
  }

  private async assertOwner(
    shopId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const owner = await (
      manager?.getRepository(ShopMember) ?? this.shopMemberRepository
    ).findOneBy({
      shopId,
      userId,
      memberRole: ShopMemberRole.OWNER,
      status: ShopMemberStatus.ACTIVE,
    });
    if (!owner) throw new ForbiddenException('Shop owner access required');
  }

  private normalizeOptionalText(value?: string | null): string | null {
    return value?.trim() || null;
  }
}
