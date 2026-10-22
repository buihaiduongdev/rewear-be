import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { Shop, ShopMember } from './entities';
import {
  shopListSchema,
  shopMemberListSchema,
  shopMemberSchema,
  shopMembershipListSchema,
  shopSchema,
} from './schemas';
import {
  addShopStaffSchema,
  createShopSchema,
  updateShopSchema,
  updateShopStaffSchema,
} from './schemas/shop-input.schema';
import type {
  AddShopStaffInput,
  CreateShopInput,
  UpdateShopInput,
  UpdateShopStaffInput,
} from './schemas/shop-input.schema';
import { ShopService } from './shop.service';

@ApiTags('Shops')
@Controller('shops')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  @Serialize(shopListSchema)
  findAll(): Promise<Shop[]> {
    return this.shopService.findAll();
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopMembershipListSchema)
  findMine(@CurrentUser() currentUser: User): Promise<ShopMember[]> {
    return this.shopService.findMyMemberships(currentUser.id);
  }

  @Get(':id')
  @Serialize(shopSchema)
  findOne(@Param('id', { schema: uuidSchema }) id: string): Promise<Shop> {
    return this.shopService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopSchema, { status: HttpStatus.CREATED })
  create(
    @CurrentUser() currentUser: User,
    @Body({ schema: createShopSchema }) input: CreateShopInput,
  ): Promise<Shop> {
    return this.shopService.create(currentUser.id, input);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopSchema)
  update(
    @CurrentUser() currentUser: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateShopSchema }) input: UpdateShopInput,
  ): Promise<Shop> {
    return this.shopService.update(id, currentUser.id, input);
  }

  @Get(':id/members')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopMemberListSchema)
  findMembers(
    @CurrentUser() currentUser: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<ShopMember[]> {
    return this.shopService.findMembers(id, currentUser.id);
  }

  @Post(':id/members')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopMemberSchema, { status: HttpStatus.CREATED })
  addStaff(
    @CurrentUser() currentUser: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: addShopStaffSchema }) input: AddShopStaffInput,
  ): Promise<ShopMember> {
    return this.shopService.addStaff(id, currentUser.id, input);
  }

  @Patch(':shopId/members/:memberId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopMemberSchema)
  updateStaff(
    @CurrentUser() currentUser: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('memberId', { schema: uuidSchema }) memberId: string,
    @Body({ schema: updateShopStaffSchema }) input: UpdateShopStaffInput,
  ): Promise<ShopMember> {
    return this.shopService.updateStaff(
      shopId,
      memberId,
      currentUser.id,
      input,
    );
  }
}
