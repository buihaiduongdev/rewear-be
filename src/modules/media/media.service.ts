import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, EntityManager, Repository } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import type {
  StoredObjectMetadata,
  UploadTicket,
} from '@/infrastructure/storage';
import { ConfigService } from '@/modules/config';
import { Product } from '@/modules/product/entities';
import { ProductService } from '@/modules/product/product.service';

import {
  ConfirmMediaUploadDto,
  CreateMediaUploadTicketDto,
  ReorderMediaDto,
} from './dto';
import { Media, MediaLink } from './entities';
import { MediaOwnerType, MediaRole, MediaType } from './enums';

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
    await this.productService.findOne(productId);
    const links = await this.findProductLinks(
      this.mediaLinkRepository,
      productId,
    );
    return links.map((link) => this.toView(link));
  }

  async createUploadTicket(
    productId: string,
    currentUserId: string,
    input: CreateMediaUploadTicketDto,
  ): Promise<UploadTicket> {
    await this.productService.findOneForManagement(productId, currentUserId);
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
    input: ConfirmMediaUploadDto,
  ): Promise<ProductMediaView> {
    await this.productService.findOneForManagement(productId, currentUserId);
    const mimeType = this.validateUploadMetadata(
      input.mimeType,
      input.sizeBytes,
    );
    this.validateStorageKey(productId, input.storageKey, mimeType);
    await this.validateStoredObject(
      input.storageKey,
      mimeType,
      input.sizeBytes,
    );

    try {
      const link = await this.dataSource.transaction(async (manager) => {
        await this.lockProduct(manager, productId);
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
          }),
        );
      });
      return this.toView(link);
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        await this.deleteStoredObject(input.storageKey);
      }
      throw error;
    }
  }

  async reorder(
    productId: string,
    currentUserId: string,
    input: ReorderMediaDto,
  ): Promise<ProductMediaView[]> {
    await this.productService.findOneForManagement(productId, currentUserId);
    return this.dataSource.transaction(async (manager) => {
      await this.lockProduct(manager, productId);
      const links = await this.findProductLinks(
        manager.getRepository(MediaLink),
        productId,
      );
      const currentIds = new Set(links.map(({ mediaId }) => mediaId));
      if (
        input.mediaIds.length !== links.length ||
        input.mediaIds.some((id) => !currentIds.has(id))
      ) {
        throw new BadRequestException(
          'mediaIds must contain every product media id exactly once',
        );
      }

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
    await this.productService.findOneForManagement(productId, currentUserId);
    return this.dataSource.transaction(async (manager) => {
      await this.lockProduct(manager, productId);
      const links = await this.findProductLinks(
        manager.getRepository(MediaLink),
        productId,
      );
      const target = links.find((link) => link.mediaId === mediaId);
      if (!target) throw new NotFoundException('Product media not found');
      if (target.role === MediaRole.COVER) return this.toView(target);

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
    await this.productService.findOneForManagement(productId, currentUserId);
    const storageKey = await this.dataSource.transaction(async (manager) => {
      await this.lockProduct(manager, productId);
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
      await manager.remove(target.media);
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

  private async lockProduct(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
    await manager.findOneOrFail(Product, {
      where: { id: productId },
      select: { id: true },
      lock: { mode: 'pessimistic_write' },
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
  ): Promise<void> {
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
      await this.deleteStoredObject(storageKey);
      throw new BadRequestException(
        'Uploaded object metadata does not match the upload request',
      );
    }
  }

  private toView(link: MediaLink): ProductMediaView {
    return {
      id: link.mediaId,
      url: link.media.url,
      mediaType: link.media.mediaType,
      mimeType: link.media.mimeType,
      sizeBytes: link.media.sizeBytes,
      role: link.role,
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
