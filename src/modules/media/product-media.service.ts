import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { ProductService } from '@/modules/product/product.service';

import { MAX_PRODUCT_MEDIA } from './constants';
import { ProductMedia } from './entities';
import { MediaRole } from './enums';
import { MediaService } from './media.service';
import type {
  ConfirmMediaUploadInput,
  ReorderMediaInput,
  UpdateMediaMetadataInput,
} from './schemas/media-input.schema';
import type { ProductMediaView } from './types/product-media.type';

@Injectable()
export class ProductMediaService {
  private readonly logger = new Logger(ProductMediaService.name);

  constructor(
    @InjectRepository(ProductMedia)
    private readonly mediaLinkRepository: Repository<ProductMedia>,
    private readonly dataSource: DataSource,
    private readonly productService: ProductService,
    private readonly storageService: StorageService,
    private readonly uploads: MediaService,
  ) {}

  async findAll(productId: string): Promise<ProductMediaView[]> {
    const product = await this.productService.findOne(productId);
    const links = await this.productService.findPublishedMedia(product);
    return links.map((link) => this.toView(link));
  }

  async findForManagement(
    productId: string,
    shopId?: string,
  ): Promise<ProductMediaView[]> {
    await this.productService.findManagedProduct(productId, shopId);
    return (
      await this.findProductLinks(this.mediaLinkRepository, productId)
    ).map((link) => this.toView(link));
  }

  async updateMetadata(
    productId: string,
    mediaId: string,
    userId: string,
    input: UpdateMediaMetadataInput,
    shopId?: string,
  ): Promise<ProductMediaView> {
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockProduct(
        manager,
        productId,
        shopId,
      );
      this.productService.assertEditable(product);
      const link = await manager.findOneOrFail(ProductMedia, {
        where: {
          productId,
          mediaId,
        },
        relations: { media: true },
      });
      if (link.angle !== input.angle) {
        await this.productService.markContentChanged(manager, product);
        link.angle = input.angle;
        await manager.save(link);
      }
      return this.toView(link);
    });
  }

  async confirmUpload(
    productId: string,
    currentUserId: string,
    input: ConfirmMediaUploadInput,
    shopId?: string,
  ): Promise<ProductMediaView> {
    const managedProduct = await this.productService.findManagedProduct(
      productId,
      shopId,
    );
    this.productService.assertEditable(managedProduct);
    const link = await this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockProduct(
        manager,
        productId,
        shopId,
      );
      await this.productService.markContentChanged(manager, product);
      const existingCount = await manager.count(ProductMedia, {
        where: { productId },
      });
      this.assertMediaCapacity(existingCount);

      const media = await this.uploads.verifyMedia(
        manager,
        currentUserId,
        input.mediaId,
      );
      return manager.save(
        manager.create(ProductMedia, {
          media,
          mediaId: media.id,
          productId,
          role: existingCount === 0 ? MediaRole.COVER : MediaRole.GALLERY,
          sortOrder: existingCount,
          angle: input.angle ?? null,
        }),
      );
    });
    return this.toView(link);
  }

  async reorder(
    productId: string,
    currentUserId: string,
    input: ReorderMediaInput,
    shopId?: string,
  ): Promise<ProductMediaView[]> {
    const managedProduct = await this.productService.findManagedProduct(
      productId,
      shopId,
    );
    this.productService.assertEditable(managedProduct);
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockProduct(
        manager,
        productId,
        shopId,
      );
      this.productService.assertEditable(product);
      const links = await this.findProductLinks(
        manager.getRepository(ProductMedia),
        productId,
      );
      const currentIds = new Set(links.map(({ mediaId }) => mediaId));
      if (
        input.mediaIds.length !== links.length ||
        new Set(input.mediaIds).size !== input.mediaIds.length ||
        input.mediaIds.some((id) => !currentIds.has(id))
      ) {
        throw new BadRequestException(
          'mediaIds must contain every product media id exactly once',
        );
      }

      if (links.every((link, index) => link.mediaId === input.mediaIds[index]))
        return links.map((link) => this.toView(link));
      await this.productService.markContentChanged(manager, product);

      const [updatedRows, affected]: [ProductMedia[], number] =
        await manager.query(
          `WITH product_media_count AS (
           SELECT count(*)::int AS total_count
           FROM product_media
           WHERE "productId" = $2
         ),
         new_positions AS (
           SELECT id, (position - 1) AS new_sort_order
           FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, position)
         )
         UPDATE product_media AS link
         SET "sortOrder" = new_positions.new_sort_order, "updatedAt" = NOW()
         FROM new_positions, product_media_count
         WHERE link."mediaId" = new_positions.id
           AND link."productId" = $2
           AND product_media_count.total_count = cardinality($1::uuid[])
         RETURNING link.*`,
          [input.mediaIds, productId],
        );

      if (affected !== input.mediaIds.length) {
        throw new BadRequestException(
          'mediaIds must contain every product media id exactly once',
        );
      }

      const byMediaId = new Map(links.map((link) => [link.mediaId, link]));
      const sortOrderMap = new Map(
        updatedRows.map((row) => [row.mediaId, row.sortOrder]),
      );

      return input.mediaIds.map((mediaId) => {
        const link = byMediaId.get(mediaId) as ProductMedia;
        link.sortOrder = sortOrderMap.get(mediaId) ?? link.sortOrder;
        return this.toView(link);
      });
    });
  }

  async setCover(
    productId: string,
    mediaId: string,
    shopId?: string,
  ): Promise<ProductMediaView> {
    const managedProduct = await this.productService.findManagedProduct(
      productId,
      shopId,
    );
    this.productService.assertEditable(managedProduct);
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockProduct(
        manager,
        productId,
        shopId,
      );
      this.productService.assertEditable(product);
      const links = await this.findProductLinks(
        manager.getRepository(ProductMedia),
        productId,
      );
      const target = links.find((link) => link.mediaId === mediaId);
      if (!target) throw new NotFoundException('Product media not found');
      if (target.role === MediaRole.COVER) return this.toView(target);

      await this.productService.markContentChanged(manager, product);
      const currentCover = links.find((link) => link.role === MediaRole.COVER);
      if (currentCover) {
        currentCover.role = MediaRole.GALLERY;
        await manager.save(currentCover);
      }
      target.role = MediaRole.COVER;
      await manager.save(target);
      return this.toView(target);
    });
  }

  async delete(
    productId: string,
    mediaId: string,
    _currentUserId: string,
    shopId?: string,
  ): Promise<ProductMediaView[]> {
    const managedProduct = await this.productService.findManagedProduct(
      productId,
      shopId,
    );
    this.productService.assertEditable(managedProduct);
    const { storageKey, remaining } = await this.dataSource.transaction(
      async (manager) => {
        const product = await this.productService.lockProduct(
          manager,
          productId,
          shopId,
        );
        await this.productService.markContentChanged(manager, product);
        const links = await this.findProductLinks(
          manager.getRepository(ProductMedia),
          productId,
        );
        const target = links.find((link) => link.mediaId === mediaId);
        if (!target) throw new NotFoundException('Product media not found');

        await manager.remove(target);
        const remaining = links.filter((link) => link.mediaId !== mediaId);
        remaining.forEach((link, index) => {
          link.sortOrder = index;
        });
        const shouldPromoteCover =
          target.role === MediaRole.COVER &&
          remaining.length > 0 &&
          !remaining.some((link) => link.role === MediaRole.COVER);

        if (shouldPromoteCover) {
          remaining[0].role = MediaRole.COVER;
        }

        if (remaining.length > 0) {
          const remainingIds = remaining.map((link) => link.mediaId);
          await manager.query(
            `
            WITH new_positions AS (
              SELECT id, (position - 1) AS new_sort_order
              FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, position)
            )
            UPDATE product_media AS link
            SET "sortOrder" = new_positions.new_sort_order,
                "role" = CASE
                  WHEN new_positions.new_sort_order = 0 AND $3 = true THEN 'COVER'::"product_media_role_enum"
                  ELSE link."role"
                END,
                "updatedAt" = NOW()
            FROM new_positions
            WHERE link."mediaId" = new_positions.id
              AND link."productId" = $2
            `,
            [remainingIds, productId, shouldPromoteCover],
          );
        }

        const otherLinkCount = await manager.count(ProductMedia, {
          where: { mediaId },
        });
        if (otherLinkCount > 0) return { storageKey: null, remaining };
        target.media.retiredAt = new Date();
        await manager.save(target.media);
        return { storageKey: target.media.storageKey, remaining };
      },
    );

    if (storageKey) await this.deleteStoredObject(storageKey);
    return remaining.map((link) => this.toView(link));
  }

  private findProductLinks(
    repository: Repository<ProductMedia>,
    productId: string,
  ): Promise<ProductMedia[]> {
    return repository.find({
      where: { productId },
      relations: { media: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  private assertMediaCapacity(existingCount: number): void {
    if (existingCount >= MAX_PRODUCT_MEDIA) {
      throw new BadRequestException(
        `A product can have at most ${MAX_PRODUCT_MEDIA} images`,
      );
    }
  }

  private toView(link: ProductMedia): ProductMediaView {
    if (!link.media.url || !link.role)
      throw new InternalServerErrorException('Invalid product media');
    return {
      id: link.mediaId,
      url: link.media.url,
      mediaType: link.media.mediaType,
      mimeType: link.media.mimeType,
      sizeBytes: link.media.sizeBytes,
      role: link.role,
      angle: link.angle ?? null,
      sortOrder: link.sortOrder,
      createdAt: link.media.createdAt,
      updatedAt: link.media.updatedAt,
    };
  }

  private async deleteStoredObject(storageKey: string): Promise<void> {
    try {
      await this.storageService.delete(storageKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to delete storage object ${storageKey}: ${message}`,
      );
    }
  }
}
