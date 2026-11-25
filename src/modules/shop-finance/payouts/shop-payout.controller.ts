import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { acceptOrderSchema } from '@/modules/order/schemas/order.schema';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import {
  bankAccountInputSchema,
  bankAccountViewSchema,
  payoutAdminViewSchema,
  payoutFailureSchema,
  payoutOwnerViewSchema,
  payoutReasonSchema,
  payoutRequestSchema,
  payoutSuccessSchema,
  payoutViewSchema,
} from './schemas/payout.schema';
import type {
  BankAccountInput,
  PayoutFailureInput,
  PayoutRequestInput,
  PayoutSuccessInput,
} from './schemas/payout.schema';
import { ShopPayoutService } from './shop-payout.service';

@ApiTags('Shop payouts')
@ApiBearerAuth()
@Controller('shops/:shopId/finance')
export class ShopPayoutController {
  constructor(private readonly service: ShopPayoutService) {}

  @Serialize(payoutOwnerViewSchema)
  @Get('payouts')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  view(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.service.ownerView(user.id, shopId);
  }

  @Serialize(bankAccountViewSchema)
  @Post('bank-accounts')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  addBank(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: bankAccountInputSchema }) input: BankAccountInput,
  ) {
    return this.service.saveBank(user.id, shopId, input);
  }

  @Serialize(bankAccountViewSchema)
  @Patch('bank-accounts/:id')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  editBank(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: bankAccountInputSchema }) input: BankAccountInput,
  ) {
    return this.service.saveBank(user.id, shopId, input, id);
  }

  @Delete('bank-accounts/:id')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  deleteBank(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.deleteBank(user.id, shopId, id);
  }

  @Serialize(payoutViewSchema)
  @Post('payouts')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  request(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: payoutRequestSchema }) input: PayoutRequestInput,
  ) {
    return this.service.request(user.id, shopId, input);
  }

  @Serialize(payoutViewSchema)
  @Post('payouts/:id/cancel')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  cancel(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.cancel(user.id, shopId, id);
  }
}

@ApiTags('Admin shop payouts')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@AuthenticatedAccess()
@Controller('admin')
export class AdminShopPayoutController {
  constructor(private readonly service: ShopPayoutService) {}

  @Serialize(payoutAdminViewSchema)
  @Get('shop-payouts')
  view(@CurrentUser() user: User) {
    return this.service.adminView(user.id);
  }

  @Serialize(payoutViewSchema)
  @Post('shop-payouts/:id/start')
  start(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.service.start(user.id, id);
  }

  @Serialize(payoutViewSchema)
  @Post('shop-payouts/:id/reject')
  reject(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: payoutReasonSchema }) input: { reason: string },
  ) {
    return this.service.reject(user.id, id, input.reason);
  }

  @Serialize(payoutViewSchema)
  @Post('shop-payouts/:id/failure')
  fail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: payoutFailureSchema }) input: PayoutFailureInput,
  ) {
    return this.service.fail(user.id, id, input);
  }

  @Serialize(payoutViewSchema)
  @Post('shop-payouts/:id/success')
  succeed(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: payoutSuccessSchema }) input: PayoutSuccessInput,
  ) {
    return this.service.succeed(user.id, id, input);
  }
}
