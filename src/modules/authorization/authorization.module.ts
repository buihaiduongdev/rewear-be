import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from '@/modules/auth/guards';

import { AuthorizationService } from './authorization.service';
import { ShopMemberRoleAssignment } from './entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from './entities/shop-role-permission.entity';
import { ShopRole } from './entities/shop-role.entity';
import { PermissionGuard } from './guards/permission.guard';
import { ShopRoleController } from './shop-role.controller';
import { ShopRoleService } from './shop-role.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShopRole,
      ShopRolePermission,
      ShopMemberRoleAssignment,
    ]),
  ],
  controllers: [ShopRoleController],
  providers: [
    AuthorizationService,
    ShopRoleService,
    JwtAuthGuard,
    PermissionGuard,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
  exports: [AuthorizationService, ShopRoleService],
})
export class AuthorizationModule {}
