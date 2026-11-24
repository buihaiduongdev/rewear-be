import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ConfigService } from '@/modules/config';

import type {
  CreateUploadTicketInput,
  IStorageProvider,
  PrivateUploadTicket,
  StorageVisibility,
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

  private bucket(visibility: StorageVisibility): string {
    const { bucket, privateBucket } = this.configService.storage;
    if (visibility === 'public') return bucket;
    if (
      !privateBucket ||
      privateBucket === bucket ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(privateBucket)
    )
      throw new ServiceUnavailableException(
        'Private evidence storage is not configured',
      );
    return privateBucket;
  }

  createUploadTicket(
    input: CreateUploadTicketInput,
    visibility?: 'public',
  ): Promise<UploadTicket>;
  createUploadTicket(
    input: CreateUploadTicketInput,
    visibility: 'private',
  ): Promise<PrivateUploadTicket>;
  async createUploadTicket(
    { contentType, key, sizeBytes }: CreateUploadTicketInput,
    visibility: StorageVisibility = 'public',
  ): Promise<UploadTicket | PrivateUploadTicket> {
    const { publicBaseUrl, uploadExpiresInSeconds } =
      this.configService.storage;
    const bucket = this.bucket(visibility);
    const expiresIn = uploadExpiresInSeconds;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ...(visibility === 'private' ? { ContentLength: sizeBytes } : {}),
        IfNoneMatch: '*',
      }),
      {
        expiresIn,
        signableHeaders: new Set(
          visibility === 'private'
            ? ['if-none-match', 'content-type', 'content-length']
            : ['if-none-match'],
        ),
      },
    );

    const common = {
      uploadUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': contentType, 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
    return visibility === 'private'
      ? common
      : { ...common, storageKey: key, publicUrl: `${publicBaseUrl}/${key}` };
  }

  async getObjectMetadata(
    key: string,
    visibility: StorageVisibility = 'public',
  ): Promise<StoredObjectMetadata> {
    const bucket = this.bucket(visibility);
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      return {
        contentType: response.ContentType,
        eTag: response.ETag,
        sizeBytes: response.ContentLength,
      };
    } catch (error) {
      if (visibility === 'private')
        throw new ServiceUnavailableException(
          'Evidence object metadata is unavailable',
        );
      throw error;
    }
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
