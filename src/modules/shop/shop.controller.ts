import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
import { User } from '@/modules/user/entities';

import { Shop } from './entities';
import {
  shopListSchema,
  shopMemberListSchema,
  shopMembershipListSchema,
  shopSchema,
} from './schemas';
import {
  createShopSchema,
  inviteSchema,
  updateShopSchema,
} from './schemas/shop-input.schema';
import type {
  CreateShopInput,
  InviteShopMemberInput,
  UpdateShopInput,
} from './schemas/shop-input.schema';
import {
  acceptedShopMemberSchema,
  shopInvitationListSchema,
  shopInvitationSchema,
} from './schemas/shop-invitation.schema';
import { ShopService } from './shop.service';

@ApiTags('Shops')
@Controller()
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('shops')
  @PublicAccess()
  @Serialize(shopListSchema)
  findAll(): Promise<Shop[]> {
    return this.shopService.findAll();
  }

  @Get('shops/me')
  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Serialize(shopMembershipListSchema)
  findMine(@CurrentUser() currentUser: User) {
    return this.shopService.findMyMemberships(currentUser.id);
  }

  @Get('shops/:shopId')
  @PublicAccess()
  @Serialize(shopSchema)
  findOne(@Param('shopId', { schema: uuidSchema }) id: string): Promise<Shop> {
    return this.shopService.findOne(id);
  }

  @Post('shops')
  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Serialize(shopSchema, { status: HttpStatus.CREATED })
  create(
    @CurrentUser() currentUser: User,
    @Body({ schema: createShopSchema }) input: CreateShopInput,
  ): Promise<Shop> {
    return this.shopService.create(currentUser.id, input);
  }

  @Patch('shops/:shopId')
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.SHOP_UPDATE)
  @Serialize(shopSchema)
  update(
    @CurrentUser() currentUser: User,
    @Param('shopId', { schema: uuidSchema }) id: string,
    @Body({ schema: updateShopSchema }) input: UpdateShopInput,
  ): Promise<Shop> {
    return this.shopService.update(id, currentUser.id, input);
  }

  @Get('shops/:shopId/members')
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Serialize(shopMemberListSchema)
  findMembers(@Param('shopId', { schema: uuidSchema }) id: string) {
    return this.shopService.findMembers(id);
  }

  @Delete('shops/:shopId/members/:memberId')
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('memberId', { schema: uuidSchema }) memberId: string,
  ): Promise<void> {
    return this.shopService.removeMember(shopId, memberId);
  }

  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Post('shops/:shopId/invitations')
  @Serialize(shopInvitationSchema, { status: HttpStatus.CREATED })
  invite(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: inviteSchema }) input: InviteShopMemberInput,
  ) {
    return this.shopService.invite(shopId, input);
  }

  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Get('shops/:shopId/invitations')
  @Serialize(shopInvitationListSchema)
  list(@Param('shopId', { schema: uuidSchema }) shopId: string) {
    return this.shopService.list(shopId);
  }

  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Post('shops/:shopId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.shopService.leave(shopId, user.id);
  }

  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Get('shop-invitations/me')
  @Serialize(shopInvitationListSchema)
  findMyInvitations(@CurrentUser() user: User) {
    return this.shopService.findMyInvitations(user.id);
  }

  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Post('shops/:shopId/invitations/:invitationId/revoke')
  @HttpCode(HttpStatus.OK)
  @Serialize(shopInvitationSchema)
  revoke(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('invitationId', { schema: uuidSchema }) invitationId: string,
  ) {
    return this.shopService.revoke(shopId, invitationId);
  }

  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Post('shop-invitations/:invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @Serialize(acceptedShopMemberSchema)
  accept(
    @CurrentUser() user: User,
    @Param('invitationId', { schema: uuidSchema }) invitationId: string,
  ) {
    return this.shopService.accept(user.id, invitationId);
  }
}
