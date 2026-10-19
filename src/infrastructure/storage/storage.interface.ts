export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

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

export interface StoredObjectMetadata {
  contentType?: string;
  sizeBytes?: number;
}

export interface IStorageProvider {
  createUploadTicket(input: CreateUploadTicketInput): Promise<UploadTicket>;
  getObjectMetadata(key: string): Promise<StoredObjectMetadata>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}
