export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
export type StorageVisibility = 'public' | 'private';

export interface CreateUploadTicketInput {
  key: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadTicket {
  storageKey: string;
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

export type PrivateUploadTicket = Omit<
  UploadTicket,
  'storageKey' | 'publicUrl'
>;
export interface SignedDownload {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObjectMetadata {
  eTag?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface IStorageProvider {
  createUploadTicket(
    input: CreateUploadTicketInput,
    visibility: 'public',
  ): Promise<UploadTicket>;
  createUploadTicket(
    input: CreateUploadTicketInput,
    visibility: 'private',
  ): Promise<PrivateUploadTicket>;
  getObjectMetadata(
    key: string,
    visibility: StorageVisibility,
  ): Promise<StoredObjectMetadata>;
  createDownloadUrl(key: string): Promise<SignedDownload>;
  getPublicUrl(key: string): string;
  delete(key: string, visibility: StorageVisibility): Promise<void>;
}
