import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import type { MomoNotification } from '@/infrastructure/payment/momo-sandbox.client';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
import { FeePaymentService } from '@/modules/fees/payments/fee-payment.service';
import { User } from '@/modules/user/entities';

import { PaymentService } from './payment.service';
import type { CreatePaymentInput } from './schemas/payment.schema';
import {
  createPaymentSchema,
  momoIpnSchema,
  paymentViewSchema,
} from './schemas/payment.schema';

@ApiTags('Payments')
@Controller()
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly feePayments: FeePaymentService,
  ) {}

  @AuthenticatedAccess()
  @Post('checkouts/:id/payments/momo')
  @HttpCode(200)
  @ApiBearerAuth()
  @Serialize(paymentViewSchema)
  create(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: createPaymentSchema }) input: CreatePaymentInput,
  ) {
    return this.paymentService.create(user.id, id, input);
  }

  @AuthenticatedAccess()
  @Get('payments/:id')
  @ApiBearerAuth()
  @Serialize(paymentViewSchema)
  find(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.paymentService.findMine(user.id, id);
  }

  @AuthenticatedAccess()
  @Post('payments/:id/reconcile')
  @HttpCode(200)
  @ApiBearerAuth()
  @Serialize(paymentViewSchema)
  reconcile(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.paymentService.reconcile(user.id, id);
  }

  @PublicAccess()
  @Post('payments/momo/ipn')
  @HttpCode(204)
  async ipn(@Body({ schema: momoIpnSchema }) input: MomoNotification) {
    if (await this.feePayments.handles(input.orderId))
      await this.feePayments.ipn(input);
    else await this.paymentService.ipn(input);
  }
}
