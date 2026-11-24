import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, MoreThan } from 'typeorm';
import z from 'zod';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { UserRole } from '@/modules/user/enums';

import { SHOP_APPLICATION_POLICY } from '../constants/shop-application.constant';
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
    private readonly storage: PrivateEvidenceStorage,
  ) {}
  async createUpload(
    userId: string,
    applicationId: string,
    input: z.input<typeof applicationUploadSchema>,
  ) {
    const data = applicationUploadSchema.parse(input);
    this.storage.assertConfigured();
    const row = await this.db.transaction(async (manager) => {
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
      const id = randomUUID();
      return manager.save(
        ShopApplicationDocument,
        manager.create(ShopApplicationDocument, {
          id,
          applicationId,
          uploadedById: userId,
          slot: data.slot,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
          storageKey: `shop-identity/${userId}/${applicationId}/${id}`,
          ready: false,
          eTag: null,
          firstSubmittedRevision: null,
          uploadExpiresAt: new Date(
            now.getTime() + SHOP_APPLICATION_POLICY.UPLOAD_TTL_MS,
          ),
        }),
      );
    });
    const ticket = await this.storage.createUploadTicket({
      key: row.storageKey,
      contentType: row.mimeType,
      sizeBytes: row.sizeBytes,
    });
    return { id: row.id, ...ticket, expiresAt: row.uploadExpiresAt };
  }
  async complete(userId: string, id: string) {
    await this.access.active(this.db.manager, userId);
    const original = await this.db.manager.findOneBy(ShopApplicationDocument, {
      id,
      uploadedById: userId,
    });
    if (!original) throw new NotFoundException('Identity upload not found');
    await this.access.own(this.db.manager, userId, original.applicationId);
    const metadata = await this.storage.getObjectMetadata(original.storageKey);
    return this.db.transaction(async (manager) => {
      const now = await applicationClock(manager);
      const application = await this.access.own(
        manager,
        userId,
        original.applicationId,
      );
      const row = await manager.findOneByOrFail(ShopApplicationDocument, {
        id,
        uploadedById: userId,
        applicationId: application.id,
      });
      if (!row.ready && !editableApplication(application.state))
        throw new ConflictException(
          'Application is not open for document uploads',
        );
      const invalidMetadata =
        !metadata.eTag ||
        metadata.eTag.length > 255 ||
        metadata.contentType !== row.mimeType ||
        metadata.sizeBytes !== row.sizeBytes ||
        (row.ready && row.eTag !== metadata.eTag);
      if (invalidMetadata)
        throw new BadRequestException(
          'Identity document metadata does not match immutable upload',
        );
      if (!row.ready && row.uploadExpiresAt <= now)
        throw new BadRequestException('Identity upload expired');
      row.ready = true;
      row.eTag = metadata.eTag!;
      await manager.save(row);
      return {
        id: row.id,
        slot: row.slot,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        ready: row.ready,
      };
    });
  }
  download(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const actor = await this.access.active(manager, userId);
      const row = await manager.findOneBy(ShopApplicationDocument, { id });
      if (!row?.ready || !row.eTag)
        throw new NotFoundException('Identity document not found');
      if (row.uploadedById === userId)
        await this.access.own(manager, userId, row.applicationId);
      else if (
        actor.role === UserRole.ADMIN &&
        row.firstSubmittedRevision !== null
      )
        await this.access.admin(manager, userId, row.applicationId);
      else throw new NotFoundException('Identity document not found');
      return this.storage.createDownloadUrl(row.storageKey, row.eTag);
    });
  }
}
