import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { MediaModule } from '@/modules/media/media.module';

import {
  OwnerIdentity,
  OwnerIdentityDocument,
  ShopApplication,
  ShopApplicationAudit,
  ShopApplicationCommand,
  ShopApplicationDocument,
  ShopApplicationRevision,
} from './entities/shop-application.entity';
import { ShopApplicationMediaService } from './media/shop-application-media.service';
import { IdentityRenewalWorker } from './renewal/identity-renewal.worker';
import { OwnerIdentityRenewalService } from './renewal/owner-identity-renewal.service';
import { ShopApplicationAdminService } from './shop-application-admin.service';
import { ShopApplicationReadService } from './shop-application-read.service';
import { ShopApplicationAccess } from './shop-application.access';
import { ShopApplicationController } from './shop-application.controller';
import { ShopApplicationService } from './shop-application.service';

@Module({
  imports: [
    StorageModule,
    MediaModule,
    TypeOrmModule.forFeature([
      ShopApplication,
      ShopApplicationAudit,
      ShopApplicationCommand,
      ShopApplicationDocument,
      ShopApplicationRevision,
      OwnerIdentity,
      OwnerIdentityDocument,
    ]),
  ],
  providers: [
    IdentityRenewalWorker,
    OwnerIdentityRenewalService,
    ShopApplicationAccess,
    ShopApplicationReadService,
    ShopApplicationService,
    ShopApplicationAdminService,
    ShopApplicationMediaService,
  ],
  controllers: [ShopApplicationController],
})
export class ShopApplicationModule {}
