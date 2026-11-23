import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthorizationModule } from '@/modules/authorization/authorization.module';

import { ShopApplicationModule } from './applications/shop-application.module';
import { Shop, ShopMember } from './entities';
import { ShopInvitation } from './entities/shop-invitation.entity';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [
    ShopApplicationModule,
    AuthorizationModule,
    TypeOrmModule.forFeature([Shop, ShopMember, ShopInvitation]),
  ],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
