import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { Injectable } from '@nestjs/common';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ConfigService } from '@/modules/config/config.service';

import {
  ICreateUploadTicketInput,
  IStorageProvider,
  IUploadTicket,
} from '../../storage.interface';

@Injectable()
export class R2Service implements IStorageProvider {
  private readonly client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const config = configService.storage;

    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  async createUploadTicket({
    fileName,
    mime,
    size,
    keyPrefix = 'uploads',
  }: ICreateUploadTicketInput): Promise<IUploadTicket> {
    const extension = extname(fileName).toLowerCase();
    const key = `${keyPrefix.replace(/^\/+|\/+$/g, '')}/${randomUUID()}${extension}`;
    const config = this.configService.storage;

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: mime,
        ContentLength: size,
      }),
      { expiresIn: config.expiresIn },
    );

    return {
      key,
      uploadUrl,
      publicUrl: `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`,
      method: 'PUT',
      headers: { 'Content-Type': mime },
    };
  }
}
