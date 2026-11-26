import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { FeeSettlementService } from './fee-settlement.service';
import { FeeWalletService } from './fee-wallet.service';
import {
  feeCarrierRefundSchema,
  feeCarrierRefundViewSchema,
  feeWalletPaymentSchema,
  feeWalletPaymentViewSchema,
} from './schemas/fee-settlement.schema';
import type {
  FeeCarrierRefundInput,
  FeeWalletPaymentInput,
} from './schemas/fee-settlement.schema';

@ApiTags('Fee settlement')
@ApiBearerAuth()
@Controller()
export class FeeSettlementController {
  constructor(
    private readonly wallet: FeeWalletService,
    private readonly settlement: FeeSettlementService,
  ) {}
  @Get('admin/fee-settlement-incidents')
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  incidents(@CurrentUser() user: User) {
    return this.settlement.incidents(user.id);
  }
  @Post('fees/:id/payments/wallet')
  @AuthenticatedAccess()
  @Serialize(feeWalletPaymentViewSchema)
  pay(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: feeWalletPaymentSchema }) input: FeeWalletPaymentInput,
  ) {
    return this.wallet.pay(user.id, id, input);
  }
  @Post('admin/fee-refunds/:id/carrier-receipt')
  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Serialize(feeCarrierRefundViewSchema)
  carrierReceipt(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: feeCarrierRefundSchema }) input: FeeCarrierRefundInput,
  ) {
    return this.settlement.recordCarrierRefund(user.id, id, input);
  }
}
