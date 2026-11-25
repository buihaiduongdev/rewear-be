import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { STORAGE_PROVIDER } from './storage.interface';
import type {
  CreateUploadTicketInput,
  IStorageProvider,
  SignedDownload,
  StorageVisibility,
  UploadTicket,
} from './storage.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly provider: IStorageProvider,
  ) {}

  createUploadTicket(
    input: CreateUploadTicketInput,
    visibility: StorageVisibility = 'public',
  ): Promise<UploadTicket> {
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0)
      throw new BadRequestException('Invalid file size');
    return this.provider.createUploadTicket(
      { ...input, contentType: input.contentType.toLowerCase() },
      visibility,
    );
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
