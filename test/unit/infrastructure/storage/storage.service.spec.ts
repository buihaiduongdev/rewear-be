import type {
  ICreateUploadTicketInput,
  IStorageProvider,
  IUploadTicket,
} from '@/infrastructure/storage/storage.interface';
import { StorageService } from '@/infrastructure/storage/storage.service';

describe('StorageService', () => {
  const createUploadTicket = jest.fn<
    ReturnType<IStorageProvider['createUploadTicket']>,
    Parameters<IStorageProvider['createUploadTicket']>
  >();
  const provider: IStorageProvider = { createUploadTicket };
  const service = new StorageService(provider);
  const input: ICreateUploadTicketInput = {
    fileName: 'jacket.jpg',
    mime: 'image/jpeg',
    size: 1024,
    keyPrefix: 'listings/listing-id',
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('forwards upload metadata and returns the provider ticket', async () => {
    const ticket: IUploadTicket = {
      key: 'listings/listing-id/image.jpg',
      uploadUrl: 'https://signed.example/upload',
      publicUrl: 'https://media.example.com/listings/listing-id/image.jpg',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    };
    createUploadTicket.mockResolvedValueOnce(ticket);

    await expect(service.createUploadTicket(input)).resolves.toBe(ticket);
    expect(createUploadTicket).toHaveBeenCalledTimes(1);
    expect(createUploadTicket).toHaveBeenCalledWith(input);
  });

  it('propagates provider errors', async () => {
    const error = new Error('Upload ticket creation failed');
    createUploadTicket.mockRejectedValueOnce(error);

    await expect(service.createUploadTicket(input)).rejects.toBe(error);
  });
});
