import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { MediaModule } from '@/modules/media/media.module';

import {
  OwnerIdentity,
  ShopApplication,
  ShopApplicationDocument,
} from './entities';
import { IdentityRenewalWorker } from './renewal/identity-renewal.worker';
import { ShopApplicationMediaService } from './shop-application-media.service';
import { ShopApplicationController } from './shop-application.controller';
import { ShopApplicationService } from './shop-application.service';

@Module({
  imports: [
    StorageModule,
    MediaModule,
    TypeOrmModule.forFeature([
      ShopApplication,
      ShopApplicationDocument,
      OwnerIdentity,
    ]),
  ],
  providers: [
    IdentityRenewalWorker,
    ShopApplicationService,
    ShopApplicationMediaService,
  ],
  controllers: [ShopApplicationController],
})
export class ShopApplicationModule {}
