import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, MoreThan } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { MediaService } from '@/modules/media/media.service';
import { UserRole } from '@/modules/user/enums';

import { Shop } from '../entities';
import { ShopStatus } from '../enums';
import {
  IDENTITY_IMAGE_MIME,
  SHOP_APPLICATION_KIND,
  SHOP_APPLICATION_POLICY,
} from './constants/shop-application.constant';
import { ShopApplication, ShopApplicationDocument } from './entities';
import {
  type ApplicationUploadInput,
  applicationUploadSchema,
} from './schemas/shop-application.schema';
import {
  editableApplication,
  ShopApplicationService,
} from './shop-application.service';

@Injectable()
export class ShopApplicationMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly applications: ShopApplicationService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}

  attach(userId: string, applicationId: string, input: ApplicationUploadInput) {
    const data = applicationUploadSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await this.applications.assertActiveUser(manager, userId);
      const application = await manager.findOneBy(ShopApplication, {
        id: applicationId,
        applicantId: userId,
      });
      if (!application)
        throw new NotFoundException('Shop application not found');
      await this.applications.assertOwner(manager, userId, application.shopId);
      if (!editableApplication(application.state))
        throw new ConflictException(
          'Application is not open for document uploads',
        );
      const shop = await manager.findOneByOrFail(Shop, {
        id: application.shopId,
      });
      if (application.kind === SHOP_APPLICATION_KIND.RENEWAL) {
        if (!shop.onboardingRequired || !shop.approvedAt)
          throw new ConflictException(
            'Approved Shop identity is required for renewal',
          );
      } else if (
        !shop.onboardingRequired ||
        shop.status !== ShopStatus.PENDING ||
        shop.approvedAt
      ) {
        throw new ConflictException('Shop is not awaiting onboarding approval');
      }
      const count = await manager.countBy(ShopApplicationDocument, {
        uploadedById: userId,
        createdAt: MoreThan(
          new Date(Date.now() - SHOP_APPLICATION_POLICY.DAY_MS),
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
          isSelected: false,
          isSubmitted: false,
        }),
      );
      return {
        id: row.id,
        slot: row.slot,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        isSelected: row.isSelected,
      };
    });
  }

  async download(userId: string, id: string) {
    const manager = this.db.manager;
    const actor = await this.applications.assertActiveUser(manager, userId);
    const row = await manager.findOneBy(ShopApplicationDocument, { id });
    if (!row || row.media.visibility !== 'private' || row.media.retiredAt)
      throw new NotFoundException('Identity document not found');
    if (row.uploadedById === userId) {
      const owned = await manager.findOneBy(ShopApplication, {
        id: row.applicationId,
        applicantId: userId,
      });
      if (!owned) throw new NotFoundException('Identity document not found');
      await this.applications.assertOwner(manager, userId, owned.shopId);
    } else if (actor.role === UserRole.ADMIN && row.isSubmitted) {
      if (!(await manager.existsBy(ShopApplication, { id: row.applicationId })))
        throw new NotFoundException('Identity document not found');
    } else {
      throw new NotFoundException('Identity document not found');
    }
    return this.storage.createDownloadUrl(row.media.storageKey);
  }
}
