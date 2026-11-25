import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';

import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { Cart, CartItem } from './entities';

@Module({
  imports: [StorageModule, TypeOrmModule.forFeature([Cart, CartItem])],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
