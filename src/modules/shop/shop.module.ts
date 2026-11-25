import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { MediaModule } from '@/modules/media/media.module';

import { ShopApplicationModule } from './applications/shop-application.module';
import { Shop, ShopMember } from './entities';
import { ShopInvitation } from './entities/shop-invitation.entity';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [
    StorageModule,
    ShopApplicationModule,
    AuthorizationModule,
    MediaModule,
    TypeOrmModule.forFeature([Shop, ShopMember, ShopInvitation]),
  ],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
