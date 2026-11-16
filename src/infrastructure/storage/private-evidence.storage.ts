import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ConfigService } from '@/modules/config';
import { DISPUTE_POLICY } from '@/modules/dispute/constants/dispute.constant';

import type {
  CreateUploadTicketInput,
  StoredObjectMetadata,
} from './storage.interface';

/** Operators must enforce a private bucket policy; signing cannot establish bucket privacy. */
@Injectable()
export class PrivateEvidenceStorage {
  private readonly client: S3Client;
  constructor(private readonly config: ConfigService) {
    const { region, endpoint, accessKeyId, secretAccessKey } = config.storage;
    this.client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  assertConfigured(): void {
    this.bucket();
  }
  private bucket(): string {
    const { privateBucket, bucket } = this.config.storage;
    const privateBucketIsInvalid =
      !privateBucket ||
      privateBucket === bucket ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(privateBucket);
    if (privateBucketIsInvalid)
      throw new ServiceUnavailableException(
        'Private evidence storage is not configured',
      );
    return privateBucket;
  }
  async createUploadTicket({
    key,
    contentType,
    sizeBytes,
  }: CreateUploadTicketInput) {
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        ContentType: contentType,
        // Browsers derive this forbidden header from the Blob body; keep it signed.
        ContentLength: sizeBytes,
        IfNoneMatch: '*',
      }),
      {
        expiresIn: DISPUTE_POLICY.UPLOAD_EXPIRES_SECONDS,
        signableHeaders: new Set([
          'if-none-match',
          'content-type',
          'content-length',
        ]),
      },
    );
    return {
      uploadUrl,
      method: 'PUT' as const,
      headers: {
        'Content-Type': contentType,
        'If-None-Match': '*',
      },
      expiresAt: new Date(
        Date.now() + DISPUTE_POLICY.UPLOAD_EXPIRES_SECONDS * 1000,
      ),
    };
  }
  async getObjectMetadata(key: string): Promise<StoredObjectMetadata> {
    const bucket = this.bucket();
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        eTag: result.ETag,
        contentType: result.ContentType,
        sizeBytes: result.ContentLength,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Evidence object metadata is unavailable',
      );
    }
  }
  async createDownloadUrl(key: string, eTag: string) {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket(), Key: key, IfMatch: eTag }),
      {
        expiresIn: DISPUTE_POLICY.DOWNLOAD_EXPIRES_SECONDS,
        signableHeaders: new Set(['if-match']),
      },
    );
    return {
      url,
      headers: { 'If-Match': eTag },
      expiresAt: new Date(
        Date.now() + DISPUTE_POLICY.DOWNLOAD_EXPIRES_SECONDS * 1000,
      ),
    };
  }
}
