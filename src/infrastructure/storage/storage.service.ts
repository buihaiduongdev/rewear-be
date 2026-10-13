import { Inject, Injectable } from '@nestjs/common';

import {
  ICreateUploadTicketInput,
  type IStorageProvider,
  STORAGE_PROVIDER,
} from './storage.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly provider: IStorageProvider,
  ) {}

  createUploadTicket(input: ICreateUploadTicketInput) {
    return this.provider.createUploadTicket(input);
  }
}
