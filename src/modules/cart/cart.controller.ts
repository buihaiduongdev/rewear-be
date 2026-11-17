import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { CartService } from './cart.service';
import { addCartItemSchema, cartSchema } from './schemas/cart.schema';
import type { AddCartItemInput, CartView } from './schemas/cart.schema';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @AuthenticatedAccess()
  @Get()
  @Serialize(cartSchema)
  findMine(@CurrentUser() user: User): Promise<CartView> {
    return this.cartService.findMine(user.id);
  }

  @AuthenticatedAccess()
  @Put('items/:productId')
  @Serialize(cartSchema)
  add(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: addCartItemSchema }) _input: AddCartItemInput,
  ): Promise<CartView> {
    return this.cartService.add(user.id, productId);
  }

  @AuthenticatedAccess()
  @Delete('items/:productId')
  @Serialize(cartSchema)
  remove(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
  ): Promise<CartView> {
    return this.cartService.remove(user.id, productId);
  }
}
