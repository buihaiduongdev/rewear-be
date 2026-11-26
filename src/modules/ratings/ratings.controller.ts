import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { RatingsService } from './ratings.service';
import {
  privateRatingSchema,
  publicRatingPageSchema,
  type RatingInput,
  ratingInputSchema,
  ratingListSchema,
  type RatingMode,
  type RatingModerationInput,
  ratingModerationSchema,
  ratingReplySchema,
  ratingVersionSchema,
  shopReplyRatingSchema,
} from './schemas/rating.schema';

@ApiTags('Shop ratings')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}
  @Get('shops/:shopId')
  @PublicAccess()
  @Serialize(publicRatingPageSchema)
  shop(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Query({ schema: ratingListSchema })
    query: { mode: RatingMode; offset: number },
  ) {
    return this.ratings.publicShop(shopId, query.mode, query.offset);
  }
  @Get('mine')
  @Serialize(z.array(privateRatingSchema))
  mine(
    @CurrentUser() user: User,
    @Query({ schema: ratingListSchema.omit({ mode: true }) })
    query: { offset: number },
  ) {
    return this.ratings.mine(user.id, query.offset);
  }
  @Post()
  @HttpCode(200)
  @Serialize(privateRatingSchema)
  upsert(
    @CurrentUser() user: User,
    @Body({ schema: ratingInputSchema }) input: RatingInput,
  ) {
    return this.ratings.upsert(user.id, input);
  }
  @Get(':id/history')
  @Serialize(z.array(ratingVersionSchema))
  history(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: ratingListSchema.omit({ mode: true }) })
    query: { offset: number },
  ) {
    return this.ratings.history(user.id, id, query.offset);
  }
  @Post(':id/reply')
  @RequirePermission(SHOP_PERMISSIONS.RATING_REPLY)
  @HttpCode(200)
  @Serialize(shopReplyRatingSchema)
  reply(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: ratingReplySchema }) input: { text: string },
  ) {
    return this.ratings.reply(user.id, id, input.text);
  }
  @Get(':id/reply/history')
  @RequirePermission(SHOP_PERMISSIONS.RATING_REPLY)
  @Serialize(z.array(ratingVersionSchema))
  replyHistory(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: ratingListSchema.omit({ mode: true }) })
    query: { offset: number },
  ) {
    return this.ratings.replyHistory(user.id, id, query.offset);
  }
  @Post(':id/moderation')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(privateRatingSchema)
  moderate(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: ratingModerationSchema }) input: RatingModerationInput,
  ) {
    return this.ratings.moderate(user.id, id, input);
  }
}
