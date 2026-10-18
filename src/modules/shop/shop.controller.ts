import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import {
  AddShopStaffDto,
  CreateShopDto,
  UpdateShopDto,
  UpdateShopStaffDto,
} from './dto';
import { Shop, ShopMember } from './entities';
import {
  shopListSchema,
  shopMemberListSchema,
  shopMemberSchema,
  shopMembershipListSchema,
  shopSchema,
} from './schemas';
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
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Shop> {
    return this.shopService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopSchema)
  create(
    @CurrentUser() currentUser: User,
    @Body() input: CreateShopDto,
  ): Promise<Shop> {
    return this.shopService.create(currentUser.id, input);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopSchema)
  update(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateShopDto,
  ): Promise<Shop> {
    return this.shopService.update(id, currentUser.id, input);
  }

  @Get(':id/members')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopMemberListSchema)
  findMembers(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShopMember[]> {
    return this.shopService.findMembers(id, currentUser.id);
  }

  @Post(':id/members')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopMemberSchema)
  addStaff(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AddShopStaffDto,
  ): Promise<ShopMember> {
    return this.shopService.addStaff(id, currentUser.id, input);
  }

  @Patch(':shopId/members/:memberId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(shopMemberSchema)
  updateStaff(
    @CurrentUser() currentUser: User,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() input: UpdateShopStaffDto,
  ): Promise<ShopMember> {
    return this.shopService.updateStaff(
      shopId,
      memberId,
      currentUser.id,
      input,
    );
  }
}
