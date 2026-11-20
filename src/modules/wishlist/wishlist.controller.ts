import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import {
  addWishlistItemSchema,
  wishlistSchema,
} from './schemas/wishlist.schema';
import type {
  AddWishlistItemInput,
  WishlistView,
} from './schemas/wishlist.schema';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @AuthenticatedAccess()
  @Get()
  @Serialize(wishlistSchema)
  findMine(@CurrentUser() user: User): Promise<WishlistView> {
    return this.wishlistService.findMine(user.id);
  }

  @AuthenticatedAccess()
  @Put('items/:productId')
  @Serialize(wishlistSchema)
  add(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: addWishlistItemSchema }) _input: AddWishlistItemInput,
  ): Promise<WishlistView> {
    return this.wishlistService.add(user.id, productId);
  }

  @AuthenticatedAccess()
  @Delete('items/:productId')
  @Serialize(wishlistSchema)
  remove(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
  ): Promise<WishlistView> {
    return this.wishlistService.remove(user.id, productId);
  }
}
