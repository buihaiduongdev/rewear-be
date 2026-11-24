import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';

import { ShopApplicationModule } from './applications/shop-application.module';
import { Shop, ShopMember } from './entities';
import { ShopInvitation } from './entities/shop-invitation.entity';
import { ShopLogoController } from './shop-logo.controller';
import { ShopLogoService } from './shop-logo.service';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [
    ShopApplicationModule,
    AuthorizationModule,
    StorageModule,
    TypeOrmModule.forFeature([Shop, ShopMember, ShopInvitation]),
  ],
  controllers: [ShopController, ShopLogoController],
  providers: [ShopService, ShopLogoService],
  exports: [ShopService],
})
export class ShopModule {}
