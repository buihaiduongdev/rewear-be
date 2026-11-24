import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { ConfigService } from '@/modules/config';
import { SUPPORTED_IMAGE_EXTENSIONS } from '@/modules/media/constants';

import { Shop } from './entities';

export type ShopLogoInput = { mimeType: string; sizeBytes: number };

@Injectable()
export class ShopLogoService {
  constructor(
    private readonly db: DataSource,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private validate(input: ShopLogoInput) {
    const mimeType = input.mimeType.toLowerCase();
    const extension = SUPPORTED_IMAGE_EXTENSIONS[mimeType];
    if (!extension || !this.config.storage.allowedTypes.includes(mimeType))
      throw new BadRequestException('Unsupported image type');
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes >
        Math.min(this.config.storage.maxSizeBytes, 5 * 1024 * 1024)
    )
      throw new BadRequestException('Logo must be no larger than 5 MB');
    return { mimeType, extension };
  }

  async ticket(shopId: string, input: ShopLogoInput) {
    await this.db.getRepository(Shop).findOneByOrFail({ id: shopId });
    const { mimeType, extension } = this.validate(input);
    return this.storage.createUploadTicket({
      key: `shops/${shopId}/logos/${randomUUID()}.${extension}`,
      contentType: mimeType,
      sizeBytes: input.sizeBytes,
    });
  }

  async confirm(shopId: string, input: ShopLogoInput & { storageKey: string }) {
    const { mimeType, extension } = this.validate(input);
    const prefix = `shops/${shopId}/logos/`;
    const name = input.storageKey.slice(prefix.length);
    if (
      !input.storageKey.startsWith(prefix) ||
      !new RegExp(
        `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${extension}$`,
        'i',
      ).test(name)
    )
      throw new BadRequestException('Invalid logo storage key');
    let metadata: Awaited<ReturnType<StorageService['getObjectMetadata']>>;
    try {
      metadata = await this.storage.getObjectMetadata(input.storageKey);
    } catch (error) {
      const storageError = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        storageError.name === 'NotFound' ||
        storageError.name === 'NoSuchKey' ||
        storageError.$metadata?.httpStatusCode === 404
      )
        throw new BadRequestException('Uploaded logo was not found');
      throw error;
    }
    if (
      metadata.contentType?.toLowerCase() !== mimeType ||
      metadata.sizeBytes !== input.sizeBytes
    )
      throw new BadRequestException('Uploaded logo metadata does not match');
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const repo = manager.getRepository(Shop);
      const shop = await repo.findOneByOrFail({ id: shopId });
      shop.logoUrl = this.storage.getPublicUrl(input.storageKey);
      return repo.save(shop);
    });
  }
}
