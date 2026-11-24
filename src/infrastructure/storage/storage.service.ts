import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { ConfigService } from '@/modules/config';

import { STORAGE_PROVIDER } from './storage.interface';
import type {
  CreateUploadTicketInput,
  IStorageProvider,
  PrivateUploadTicket,
  SignedDownload,
  StorageVisibility,
  StoredObjectMetadata,
  UploadTicket,
} from './storage.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly provider: IStorageProvider,
    private readonly config: ConfigService,
  ) {}

  createUploadTicket(input: CreateUploadTicketInput): Promise<UploadTicket>;
  createUploadTicket(
    input: CreateUploadTicketInput,
    visibility: 'private',
  ): Promise<PrivateUploadTicket>;
  createUploadTicket(
    input: CreateUploadTicketInput,
    visibility: StorageVisibility = 'public',
  ): Promise<UploadTicket | PrivateUploadTicket> {
    const contentType = input.contentType.toLowerCase();
    if (
      visibility === 'public' &&
      !this.config.storage.allowedTypes.includes(contentType)
    )
      throw new BadRequestException('Unsupported file type');
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      (visibility === 'public' &&
        input.sizeBytes > this.config.storage.maxSizeBytes)
    )
      throw new BadRequestException('Invalid file size');
    const normalized = { ...input, contentType };
    return visibility === 'private'
      ? this.provider.createUploadTicket(normalized, 'private')
      : this.provider.createUploadTicket(normalized, 'public');
  }

  getObjectMetadata(
    key: string,
    visibility: StorageVisibility = 'public',
  ): Promise<StoredObjectMetadata> {
    return this.provider.getObjectMetadata(key, visibility);
  }

  createDownloadUrl(key: string): Promise<SignedDownload> {
    return this.provider.createDownloadUrl(key);
  }

  getPublicUrl(key: string): string {
    return this.provider.getPublicUrl(key);
  }

  delete(key: string, visibility: StorageVisibility = 'public'): Promise<void> {
    return this.provider.delete(key, visibility);
  }
}
