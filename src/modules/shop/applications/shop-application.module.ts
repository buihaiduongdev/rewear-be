import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { MediaModule } from '@/modules/media/media.module';

import {
  OwnerIdentity,
  ShopApplication,
  ShopApplicationDocument,
} from './entities';
import { IdentityRenewalWorker } from './identity-renewal.worker';
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
  providers: [IdentityRenewalWorker, ShopApplicationService],
  controllers: [ShopApplicationController],
})
export class ShopApplicationModule {}
