export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
export type StorageVisibility = 'public' | 'private';

export interface CreateUploadTicketInput {
  key: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadTicket {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface SignedDownload {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface IStorageProvider {
  createUploadTicket(
    input: CreateUploadTicketInput,
    visibility: StorageVisibility,
  ): Promise<UploadTicket>;
  createDownloadUrl(key: string): Promise<SignedDownload>;
  getPublicUrl(key: string): string;
  delete(key: string, visibility: StorageVisibility): Promise<void>;
}
