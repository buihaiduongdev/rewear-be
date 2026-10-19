import { Injectable } from '@nestjs/common';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ConfigService } from '@/modules/config';

import type {
  CreateUploadTicketInput,
  IStorageProvider,
  StoredObjectMetadata,
  UploadTicket,
} from '../../storage.interface';

@Injectable()
export class R2StorageService implements IStorageProvider {
  private readonly client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const { accessKeyId, endpoint, region, secretAccessKey } =
      this.configService.storage;
    this.client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async createUploadTicket({
    contentType,
    key,
  }: CreateUploadTicketInput): Promise<UploadTicket> {
    const { bucket, publicBaseUrl, uploadExpiresInSeconds } =
      this.configService.storage;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: uploadExpiresInSeconds },
    );

    return {
      storageKey: key,
      uploadUrl,
      publicUrl: `${publicBaseUrl}/${key}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + uploadExpiresInSeconds * 1000),
    };
  }

  async getObjectMetadata(key: string): Promise<StoredObjectMetadata> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.configService.storage.bucket,
        Key: key,
      }),
    );
    return {
      contentType: response.ContentType,
      sizeBytes: response.ContentLength,
    };
  }

  getPublicUrl(key: string): string {
    return `${this.configService.storage.publicBaseUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.configService.storage.bucket,
        Key: key,
      }),
    );
  }
}
