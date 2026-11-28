import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { financeListSchema } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { FinanceListInput } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { acceptOrderSchema } from '@/modules/order/schemas/order.schema';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import {
  bankAccountInputSchema,
  bankAccountViewSchema,
  payoutAdminItemViewSchema,
  payoutAdminViewSchema,
  payoutFailureSchema,
  payoutOwnerViewSchema,
  payoutReasonSchema,
  payoutReceiptDownloadViewSchema,
  payoutReceiptUploadTicketSchema,
  payoutReceiptUploadTicketViewSchema,
  payoutRequestSchema,
  payoutSuccessSchema,
  payoutViewSchema,
} from './schemas/payout.schema';
import type {
  BankAccountInput,
  PayoutFailureInput,
  PayoutReceiptUploadTicketInput,
  PayoutRequestInput,
  PayoutSuccessInput,
} from './schemas/payout.schema';
import { shopFinanceViewSchema } from './schemas/shop-finance.schema';
import { ShopFinanceService } from './shop-finance.service';
import { ShopPayoutService } from './shop-payout.service';

@ApiTags('Shop finance')
@ApiBearerAuth()
@Controller()
export class ShopFinanceController {
  constructor(
    private readonly shopFinanceService: ShopFinanceService,
    private readonly shopPayoutService: ShopPayoutService,
  ) {}

  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Get('shops/:shopId/finance')
  @Serialize(shopFinanceViewSchema)
  viewFinance(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Query({ schema: financeListSchema }) input: FinanceListInput,
  ) {
    return this.shopFinanceService.view(user.id, shopId, input);
  }

  @Serialize(payoutOwnerViewSchema)
  @Get('shops/:shopId/finance/payouts')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  viewPayouts(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.shopPayoutService.ownerView(user.id, shopId);
  }

  @Serialize(bankAccountViewSchema)
  @Post('shops/:shopId/finance/bank-accounts')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  addBank(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: bankAccountInputSchema }) input: BankAccountInput,
  ) {
    return this.shopPayoutService.saveBank(user.id, shopId, input);
  }

  @Serialize(bankAccountViewSchema)
  @Patch('shops/:shopId/finance/bank-accounts/:id')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  editBank(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: bankAccountInputSchema }) input: BankAccountInput,
  ) {
    return this.shopPayoutService.saveBank(user.id, shopId, input, id);
  }

  @Delete('shops/:shopId/finance/bank-accounts/:id')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  deleteBank(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shopPayoutService.deleteBank(user.id, shopId, id);
  }

  @Serialize(payoutViewSchema)
  @Post('shops/:shopId/finance/payouts')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  requestPayout(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: payoutRequestSchema }) input: PayoutRequestInput,
  ) {
    return this.shopPayoutService.request(user.id, shopId, input);
  }

  @Serialize(payoutViewSchema)
  @Post('shops/:shopId/finance/payouts/:id/cancel')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  cancelPayout(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shopPayoutService.cancel(user.id, shopId, id);
  }

  @Serialize(payoutAdminViewSchema)
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Get('admin/shop-payouts')
  adminViewPayouts(@CurrentUser() user: User) {
    return this.shopPayoutService.adminView(user.id);
  }

  @Serialize(payoutViewSchema)
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Post('admin/shop-payouts/:id/start')
  startPayout(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.shopPayoutService.start(user.id, id);
  }

  @Serialize(payoutViewSchema)
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Post('admin/shop-payouts/:id/reject')
  rejectPayout(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: payoutReasonSchema }) input: { reason: string },
  ) {
    return this.shopPayoutService.reject(user.id, id, input.reason);
  }

  @Serialize(payoutViewSchema)
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Post('admin/shop-payouts/:id/failure')
  failPayout(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: payoutFailureSchema }) input: PayoutFailureInput,
  ) {
    return this.shopPayoutService.fail(user.id, id, input);
  }

  @Serialize(payoutReceiptUploadTicketViewSchema, {
    status: HttpStatus.CREATED,
  })
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Post('admin/shop-payouts/receipt-upload-ticket')
  @ApiOperation({
    summary: 'Create a private upload ticket for a payout UNC bank receipt',
  })
  createReceiptUploadTicket(
    @CurrentUser() user: User,
    @Body({ schema: payoutReceiptUploadTicketSchema })
    input: PayoutReceiptUploadTicketInput,
  ) {
    return this.shopPayoutService.createReceiptUploadTicket(user.id, input);
  }

  @Serialize(payoutReceiptDownloadViewSchema)
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Get('admin/shop-payouts/:id/receipt')
  @ApiOperation({
    summary: 'Get a signed download URL for an attached payout UNC receipt',
  })
  getPayoutReceipt(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shopPayoutService.getReceiptDownload(user.id, id);
  }

  @Serialize(payoutAdminItemViewSchema)
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Post('admin/shop-payouts/:id/success')
  @ApiOperation({
    summary:
      'Mark a seller payout as succeeded with bank reference and optional UNC receipt image',
  })
  succeedPayout(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: payoutSuccessSchema }) input: PayoutSuccessInput,
  ) {
    return this.shopPayoutService.succeed(user.id, id, input);
  }
}
