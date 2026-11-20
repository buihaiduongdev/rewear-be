import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { User } from '@/modules/user/entities';

import { AuthorizationService } from './authorization.service';
import { ASSIGNABLE_SHOP_PERMISSION_KEYS } from './constants';
import { AuthenticatedAccess } from './decorators/authenticated-access.decorator';
import {
  assignRolesSchema,
  createRoleSchema,
  updateRoleSchema,
} from './schemas/shop-role-input.schema';
import type {
  AssignRolesInput,
  CreateRoleInput,
  UpdateRoleInput,
} from './schemas/shop-role-input.schema';
import {
  shopAccessSchema,
  shopPermissionListSchema,
  shopRoleAssignmentSchema,
  shopRoleListSchema,
  shopRoleSchema,
} from './schemas/shop-role.schema';
import { ShopRoleService } from './shop-role.service';

@ApiTags('Shop roles')
@ApiBearerAuth()
@Controller('shops/:shopId')
export class ShopRoleController {
  constructor(
    private readonly shopRoleService: ShopRoleService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get('permissions/me')
  @AuthenticatedAccess()
  @Serialize(shopAccessSchema)
  myPermissions(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.authorizationService.getMemberPermissions(user.id, shopId);
  }

  @Get('roles')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Serialize(shopRoleListSchema)
  list(@Param('shopId', { schema: uuidSchema }) shopId: string) {
    return this.shopRoleService.list(shopId);
  }

  @Get('permissions')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Serialize(shopPermissionListSchema)
  permissions(@Param('shopId', { schema: uuidSchema }) _shopId: string) {
    return ASSIGNABLE_SHOP_PERMISSION_KEYS;
  }

  @Post('roles')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Serialize(shopRoleSchema, { status: HttpStatus.CREATED })
  create(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: createRoleSchema }) input: CreateRoleInput,
  ) {
    return this.shopRoleService.create(shopId, input);
  }

  @Patch('roles/:roleId')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Serialize(shopRoleSchema)
  update(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('roleId', { schema: uuidSchema }) roleId: string,
    @Body({ schema: updateRoleSchema }) input: UpdateRoleInput,
  ) {
    return this.shopRoleService.update(shopId, roleId, input);
  }

  @Put('members/:memberId/roles')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Serialize(shopRoleAssignmentSchema)
  assign(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('memberId', { schema: uuidSchema }) memberId: string,
    @Body({ schema: assignRolesSchema })
    input: AssignRolesInput,
  ) {
    return this.shopRoleService.assign(shopId, memberId, input);
  }
}
