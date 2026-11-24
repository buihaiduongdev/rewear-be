import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';

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
import { ShopApplicationAdminService } from './shop-application-admin.service';
import { ShopApplicationReadService } from './shop-application-read.service';
import { ShopApplicationAccess } from './shop-application.access';
import { ShopApplicationController } from './shop-application.controller';
import { ShopApplicationService } from './shop-application.service';

@Module({
  imports: [
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
    ShopApplicationAccess,
    ShopApplicationReadService,
    ShopApplicationService,
    ShopApplicationAdminService,
    ShopApplicationMediaService,
    PrivateEvidenceStorage,
  ],
  controllers: [ShopApplicationController],
})
export class ShopApplicationModule {}
