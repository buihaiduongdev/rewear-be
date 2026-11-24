import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, MoreThan } from 'typeorm';
import z from 'zod';

import { StorageService } from '@/infrastructure/storage';
import { MediaService } from '@/modules/media/media.service';
import { UserRole } from '@/modules/user/enums';

import {
  IDENTITY_IMAGE_MIME,
  SHOP_APPLICATION_POLICY,
} from '../constants/shop-application.constant';
import { ShopApplicationDocument } from '../entities/shop-application.entity';
import {
  editableApplication,
  pendingApplicationShop,
} from '../policies/shop-application.policy';
import { applicationUploadSchema } from '../schemas/shop-application.schema';
import {
  applicationClock,
  ShopApplicationAccess,
} from '../shop-application.access';

@Injectable()
export class ShopApplicationMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ShopApplicationAccess,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}

  async attach(
    userId: string,
    applicationId: string,
    input: z.input<typeof applicationUploadSchema>,
  ) {
    const data = applicationUploadSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await applicationClock(manager);
      const application = await this.access.own(manager, userId, applicationId);
      if (!editableApplication(application.state))
        throw new ConflictException(
          'Application is not open for document uploads',
        );
      await pendingApplicationShop(manager, application);
      const count = await manager.countBy(ShopApplicationDocument, {
        uploadedById: userId,
        createdAt: MoreThan(
          new Date(now.getTime() - SHOP_APPLICATION_POLICY.DAY_MS),
        ),
      });
      if (count >= SHOP_APPLICATION_POLICY.UPLOADS_PER_DAY)
        throw new BadRequestException('Identity upload limit reached');
      const file = await this.media.verifyMedia(
        manager,
        userId,
        data.mediaId,
        SHOP_APPLICATION_POLICY.MAX_IMAGE_BYTES,
        'private',
      );
      if (!IDENTITY_IMAGE_MIME.some((mime) => mime === file.mimeType))
        throw new BadRequestException('Unsupported identity document type');
      const row = await manager.save(
        ShopApplicationDocument,
        manager.create(ShopApplicationDocument, {
          applicationId,
          uploadedById: userId,
          slot: data.slot,
          mediaId: file.id,
          firstSubmittedRevision: null,
        }),
      );
      return {
        id: row.id,
        slot: row.slot,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      };
    });
  }

  download(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const actor = await this.access.active(manager, userId);
      const row = await manager.findOneBy(ShopApplicationDocument, { id });
      if (!row || row.media.visibility !== 'private' || row.media.retiredAt)
        throw new NotFoundException('Identity document not found');
      if (row.uploadedById === userId)
        await this.access.own(manager, userId, row.applicationId);
      else if (
        actor.role === UserRole.ADMIN &&
        row.firstSubmittedRevision !== null
      )
        await this.access.admin(manager, userId, row.applicationId);
      else throw new NotFoundException('Identity document not found');
      return this.storage.createDownloadUrl(row.media.storageKey);
    });
  }
}
