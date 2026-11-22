import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import {
  shopFollowInputSchema,
  shopFollowPageSchema,
  shopFollowProductPageSchema,
  shopFollowQuerySchema,
  shopFollowStateSchema,
} from './schemas/shop-follow.schema';
import { ShopFollowFeedService } from './shop-follow-feed.service';
import { ShopFollowService } from './shop-follow.service';
import type { ShopFollowQuery } from './types/shop-follow.type';

@ApiTags('Follow Shop')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('shop-follows')
export class ShopFollowController {
  constructor(
    private readonly follows: ShopFollowService,
    private readonly feed: ShopFollowFeedService,
  ) {}
  @Get()
  @Serialize(shopFollowPageSchema)
  list(
    @CurrentUser() user: User,
    @Query({ schema: shopFollowQuerySchema }) query: ShopFollowQuery,
  ) {
    return this.follows.list(user.id, query);
  }
  @Get('products')
  @Serialize(shopFollowProductPageSchema)
  products(
    @CurrentUser() user: User,
    @Query({ schema: shopFollowQuerySchema }) query: ShopFollowQuery,
  ) {
    return this.feed.products(user.id, query);
  }
  @Get('shops/:shopId')
  @Serialize(shopFollowStateSchema)
  state(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.follows.state(user.id, shopId);
  }
  @Put('shops/:shopId')
  @Serialize(shopFollowStateSchema)
  follow(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: shopFollowInputSchema }) _input: Record<string, never>,
  ) {
    return this.follows.follow(user.id, shopId);
  }
  @Delete('shops/:shopId')
  @Serialize(shopFollowStateSchema)
  unfollow(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.follows.unfollow(user.id, shopId);
  }
}
