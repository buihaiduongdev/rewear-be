export interface ICreateUploadTicketInput {
  fileName: string;
  mime: string;
  size: number;
  keyPrefix?: string;
}

export interface IUploadTicket {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
}

export interface IStorageProvider {
  createUploadTicket(input: ICreateUploadTicketInput): Promise<IUploadTicket>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
