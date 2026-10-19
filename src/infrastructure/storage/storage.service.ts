import { Inject, Injectable } from '@nestjs/common';

import { STORAGE_PROVIDER } from './storage.interface';
import type {
  CreateUploadTicketInput,
  IStorageProvider,
  StoredObjectMetadata,
  UploadTicket,
} from './storage.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly provider: IStorageProvider,
  ) {}

  createUploadTicket(input: CreateUploadTicketInput): Promise<UploadTicket> {
    return this.provider.createUploadTicket(input);
  }

  getObjectMetadata(key: string): Promise<StoredObjectMetadata> {
    return this.provider.getObjectMetadata(key);
  }

  getPublicUrl(key: string): string {
    return this.provider.getPublicUrl(key);
  }

  delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }
}
