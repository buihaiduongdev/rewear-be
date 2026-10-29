import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { CartService } from './cart.service';
import { addCartItemSchema, cartSchema } from './schemas/cart.schema';
import type { AddCartItemInput, CartView } from './schemas/cart.schema';

@ApiTags('Cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @Serialize(cartSchema)
  findMine(@CurrentUser() user: User): Promise<CartView> {
    return this.cartService.findMine(user.id);
  }

  @Put('items/:productId')
  @Serialize(cartSchema)
  add(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: addCartItemSchema }) _input: AddCartItemInput,
  ): Promise<CartView> {
    return this.cartService.add(user.id, productId);
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
  ): Promise<void> {
    return this.cartService.remove(user.id, productId);
  }
}
