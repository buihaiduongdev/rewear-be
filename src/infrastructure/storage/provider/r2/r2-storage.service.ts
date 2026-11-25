import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ConfigService } from '@/modules/config';

import type {
  CreateUploadTicketInput,
  IStorageProvider,
  StorageVisibility,
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

  private bucket(visibility: StorageVisibility): string {
    const { bucket, privateBucket } = this.configService.storage;
    if (visibility === 'public') return bucket;
    if (!privateBucket || privateBucket === bucket)
      throw new ServiceUnavailableException(
        'Private evidence storage is not configured',
      );
    return privateBucket;
  }

  async createUploadTicket(
    { contentType, key }: CreateUploadTicketInput,
    visibility: StorageVisibility = 'public',
  ): Promise<UploadTicket> {
    const expiresIn = this.configService.storage.uploadExpiresInSeconds;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket(visibility),
        Key: key,
        ContentType: contentType,
        IfNoneMatch: '*',
      }),
      {
        expiresIn,
        signableHeaders: new Set(['if-none-match', 'content-type']),
      },
    );
    return {
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async createDownloadUrl(key: string) {
    const expiresIn = this.configService.storage.uploadExpiresInSeconds;
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket('private'),
        Key: key,
      }),
      { expiresIn },
    );
    return {
      url,
      headers: {},
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  getPublicUrl(key: string): string {
    return `${this.configService.storage.publicBaseUrl}/${key}`;
  }

  async delete(
    key: string,
    visibility: StorageVisibility = 'public',
  ): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket(visibility),
        Key: key,
      }),
    );
  }
}
