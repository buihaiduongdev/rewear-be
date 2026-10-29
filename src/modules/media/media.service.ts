import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import type {
  StoredObjectMetadata,
  UploadTicket,
} from '@/infrastructure/storage';
import { ConfigService } from '@/modules/config';
import { ProductService } from '@/modules/product/product.service';

import { Media, MediaLink } from './entities';
import { MediaOwnerType, MediaRole, MediaType } from './enums';
import type {
  ConfirmMediaUploadInput,
  CreateMediaUploadTicketInput,
  ReorderMediaInput,
  UpdateMediaMetadataInput,
} from './schemas/media-input.schema';

const MAX_PRODUCT_MEDIA = 10;
const UUID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface ProductMediaView {
  id: string;
  url: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  role: MediaRole;
  angle: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(MediaLink)
    private readonly mediaLinkRepository: Repository<MediaLink>,
    private readonly dataSource: DataSource,
    private readonly productService: ProductService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(productId: string): Promise<ProductMediaView[]> {
    const product = await this.productService.findOne(productId);
    const links = await this.productService.findPublishedMedia(product);
    return links.map((link) => this.toView(link));
  }

  async findForManagement(
    productId: string,
    userId: string,
  ): Promise<ProductMediaView[]> {
    await this.productService.findOneForManagement(productId, userId);
    return (
      await this.findProductLinks(this.mediaLinkRepository, productId)
    ).map((link) => this.toView(link));
  }

  async updateMetadata(
    productId: string,
    mediaId: string,
    userId: string,
    input: UpdateMediaMetadataInput,
  ): Promise<ProductMediaView> {
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockForManagement(
        manager,
        productId,
        userId,
      );
      this.productService.assertEditable(product);
      const link = await manager.findOne(MediaLink, {
        where: {
          ownerType: MediaOwnerType.PRODUCT,
          ownerId: productId,
          mediaId,
        },
        relations: { media: true },
      });
      if (!link) throw new NotFoundException('Product media not found');
      if (link.angle !== input.angle) {
        await this.productService.markContentChanged(manager, product);
        link.angle = input.angle;
        await manager.save(link);
      }
      return this.toView(link);
    });
  }

  async createUploadTicket(
    productId: string,
    currentUserId: string,
    input: CreateMediaUploadTicketInput,
  ): Promise<UploadTicket> {
    const managedProduct = await this.productService.findOneForManagement(
      productId,
      currentUserId,
    );
    this.productService.assertEditable(managedProduct);
    const mimeType = this.validateUploadMetadata(
      input.mimeType,
      input.sizeBytes,
    );
    const existingCount = await this.mediaLinkRepository.count({
      where: { ownerType: MediaOwnerType.PRODUCT, ownerId: productId },
    });
    this.assertMediaCapacity(existingCount);

    const extension = EXTENSIONS[mimeType];
    const storageKey = `products/${productId}/${randomUUID()}.${extension}`;
    return this.storageService.createUploadTicket({
      contentType: mimeType,
      key: storageKey,
      sizeBytes: input.sizeBytes,
    });
  }

  async confirmUpload(
    productId: string,
    currentUserId: string,
    input: ConfirmMediaUploadInput,
  ): Promise<ProductMediaView> {
    const managedProduct = await this.productService.findOneForManagement(
      productId,
      currentUserId,
    );
    this.productService.assertEditable(managedProduct);
    const mimeType = this.validateUploadMetadata(
      input.mimeType,
      input.sizeBytes,
    );
    this.validateStorageKey(productId, input.storageKey, mimeType);
    const metadata = await this.validateStoredObject(
      input.storageKey,
      mimeType,
      input.sizeBytes,
    );

    const link = await this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockForManagement(
        manager,
        productId,
        currentUserId,
      );
      await this.productService.markContentChanged(manager, product);
      const existingMedia = await manager.findOne(Media, {
        where: { storageKey: input.storageKey },
        select: { id: true },
      });
      if (existingMedia) {
        throw new ConflictException('Uploaded object is already confirmed');
      }
      const existingCount = await manager.count(MediaLink, {
        where: { ownerType: MediaOwnerType.PRODUCT, ownerId: productId },
      });
      this.assertMediaCapacity(existingCount);

      const media = await manager.save(
        manager.create(Media, {
          uploadedById: currentUserId,
          storageKey: input.storageKey,
          url: this.storageService.getPublicUrl(input.storageKey),
          mediaType: MediaType.IMAGE,
          mimeType,
          sizeBytes: input.sizeBytes,
          eTag: metadata.eTag ?? null,
          retiredAt: null,
        }),
      );
      return manager.save(
        manager.create(MediaLink, {
          media,
          mediaId: media.id,
          ownerType: MediaOwnerType.PRODUCT,
          ownerId: productId,
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
  ): Promise<ProductMediaView[]> {
    const managedProduct = await this.productService.findOneForManagement(
      productId,
      currentUserId,
    );
    this.productService.assertEditable(managedProduct);
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockForManagement(
        manager,
        productId,
        currentUserId,
      );
      this.productService.assertEditable(product);
      const links = await this.findProductLinks(
        manager.getRepository(MediaLink),
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
      const byMediaId = new Map(links.map((link) => [link.mediaId, link]));
      const ordered = input.mediaIds.map((mediaId, sortOrder) => {
        const link = byMediaId.get(mediaId) as MediaLink;
        link.sortOrder = sortOrder;
        return link;
      });
      await manager.save(ordered);
      return ordered.map((link) => this.toView(link));
    });
  }

  async setCover(
    productId: string,
    mediaId: string,
    currentUserId: string,
  ): Promise<ProductMediaView> {
    const managedProduct = await this.productService.findOneForManagement(
      productId,
      currentUserId,
    );
    this.productService.assertEditable(managedProduct);
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockForManagement(
        manager,
        productId,
        currentUserId,
      );
      this.productService.assertEditable(product);
      const links = await this.findProductLinks(
        manager.getRepository(MediaLink),
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
    currentUserId: string,
  ): Promise<void> {
    const managedProduct = await this.productService.findOneForManagement(
      productId,
      currentUserId,
    );
    this.productService.assertEditable(managedProduct);
    const storageKey = await this.dataSource.transaction(async (manager) => {
      const product = await this.productService.lockForManagement(
        manager,
        productId,
        currentUserId,
      );
      await this.productService.markContentChanged(manager, product);
      const links = await this.findProductLinks(
        manager.getRepository(MediaLink),
        productId,
      );
      const target = links.find((link) => link.mediaId === mediaId);
      if (!target) throw new NotFoundException('Product media not found');

      await manager.remove(target);
      const remaining = links.filter((link) => link.mediaId !== mediaId);
      remaining.forEach((link, index) => {
        link.sortOrder = index;
      });
      if (
        target.role === MediaRole.COVER &&
        remaining.length > 0 &&
        !remaining.some((link) => link.role === MediaRole.COVER)
      ) {
        remaining[0].role = MediaRole.COVER;
      }
      if (remaining.length > 0) await manager.save(remaining);

      const otherLinkCount = await manager.count(MediaLink, {
        where: { mediaId },
      });
      if (otherLinkCount > 0) return null;
      target.media.retiredAt = new Date();
      await manager.save(target.media);
      return target.media.storageKey;
    });

    if (storageKey) await this.deleteStoredObject(storageKey);
  }

  private findProductLinks(
    repository: Repository<MediaLink>,
    productId: string,
  ): Promise<MediaLink[]> {
    return repository.find({
      where: { ownerType: MediaOwnerType.PRODUCT, ownerId: productId },
      relations: { media: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  private validateUploadMetadata(mimeType: string, sizeBytes: number): string {
    const normalizedMimeType = mimeType.toLowerCase();
    const { allowedTypes, maxSizeBytes } = this.configService.storage;
    if (!allowedTypes.includes(normalizedMimeType)) {
      throw new BadRequestException('Unsupported image type');
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('Image size must be a positive integer');
    }
    if (sizeBytes > maxSizeBytes) {
      throw new BadRequestException('Image exceeds the maximum allowed size');
    }
    return normalizedMimeType;
  }

  private assertMediaCapacity(existingCount: number): void {
    if (existingCount >= MAX_PRODUCT_MEDIA) {
      throw new BadRequestException(
        `A product can have at most ${MAX_PRODUCT_MEDIA} images`,
      );
    }
  }

  private validateStorageKey(
    productId: string,
    storageKey: string,
    mimeType: string,
  ): void {
    const expectedKey = new RegExp(
      `^products/${productId}/${UUID_PATTERN}\\.${EXTENSIONS[mimeType]}$`,
      'i',
    );
    if (!expectedKey.test(storageKey)) {
      throw new BadRequestException('Invalid product media storage key');
    }
  }

  private async validateStoredObject(
    storageKey: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<StoredObjectMetadata> {
    let metadata: StoredObjectMetadata;
    try {
      metadata = await this.storageService.getObjectMetadata(storageKey);
    } catch (error) {
      const storageError = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        storageError.name === 'NotFound' ||
        storageError.name === 'NoSuchKey' ||
        storageError.$metadata?.httpStatusCode === 404
      ) {
        throw new BadRequestException('Uploaded object was not found');
      }
      throw error;
    }
    if (
      metadata.contentType?.toLowerCase() !== mimeType ||
      metadata.sizeBytes !== sizeBytes
    ) {
      throw new BadRequestException(
        'Uploaded object metadata does not match the upload request',
      );
    }
    return metadata;
  }

  private toView(link: MediaLink): ProductMediaView {
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
