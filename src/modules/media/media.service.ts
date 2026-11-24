import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { EntityManager, Repository } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';

import { SUPPORTED_IMAGE_EXTENSIONS } from './constants';
import { Media } from './entities';
import { MediaType } from './enums';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media) private readonly media: Repository<Media>,
    private readonly storage: StorageService,
  ) {}

  async createUploadTicket(
    userId: string,
    input: {
      mimeType: string;
      sizeBytes: number;
      visibility?: 'public' | 'private';
    },
  ) {
    const mimeType = input.mimeType.toLowerCase();
    const visibility = input.visibility ?? 'public';
    const videoExtensions: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    const extension = Object.hasOwn(SUPPORTED_IMAGE_EXTENSIONS, mimeType)
      ? SUPPORTED_IMAGE_EXTENSIONS[mimeType]
      : visibility === 'private' && Object.hasOwn(videoExtensions, mimeType)
        ? videoExtensions[mimeType]
        : undefined;
    if (!extension) throw new BadRequestException('Unsupported media type');
    if (visibility === 'private' && input.sizeBytes > 100 * 1024 * 1024)
      throw new BadRequestException('Media exceeds the maximum allowed size');
    const key = `uploads/${userId}/${randomUUID()}.${extension}`;
    const ticketInput = {
      key,
      contentType: mimeType,
      sizeBytes: input.sizeBytes,
    };
    const ticket =
      visibility === 'private'
        ? await this.storage.createUploadTicket(ticketInput, 'private')
        : await this.storage.createUploadTicket(ticketInput);
    const media = await this.media.save(
      this.media.create({
        uploadedById: userId,
        storageKey: key,
        url: visibility === 'public' ? this.storage.getPublicUrl(key) : null,
        visibility,
        mediaType: mimeType.startsWith('video/')
          ? MediaType.VIDEO
          : MediaType.IMAGE,
        mimeType,
        sizeBytes: input.sizeBytes,
        retiredAt: null,
        isAttached: false,
      }),
    );
    return { ...ticket, mediaId: media.id };
  }

  async verifyMedia(
    manager: EntityManager,
    userId: string,
    mediaId: string,
    maxBytes?: number,
    visibility: 'public' | 'private' = 'public',
  ) {
    const media = await manager.findOne(Media, {
      where: { id: mediaId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !media ||
      media.uploadedById !== userId ||
      media.retiredAt ||
      media.isAttached ||
      media.visibility !== visibility
    )
      throw new NotFoundException(
        'Upload ticket not found or already attached',
      );
    if (maxBytes !== undefined && media.sizeBytes > maxBytes)
      throw new BadRequestException('Image exceeds the maximum allowed size');
    media.isAttached = true;
    return manager.save(media);
  }
}
