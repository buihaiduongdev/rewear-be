import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import type { MomoNotification } from '@/infrastructure/payment/momo-sandbox.client';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import {
  createPaymentSchema,
  momoIpnSchema,
  paymentViewSchema,
} from './payment.schemas';
import { PaymentService } from './payment.service';

@ApiTags('Payments')
@Controller()
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('checkouts/:id/payments/momo')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(paymentViewSchema)
  create(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: createPaymentSchema }) input: { requestId: string },
  ) {
    return this.payments.create(user.id, id, input.requestId);
  }

  @Get('payments/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(paymentViewSchema)
  find(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.payments.findMine(user.id, id);
  }

  @Post('payments/:id/reconcile')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(paymentViewSchema)
  reconcile(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.payments.reconcile(user.id, id);
  }

  @Post('payments/momo/ipn')
  @HttpCode(204)
  async ipn(@Body({ schema: momoIpnSchema }) input: MomoNotification) {
    await this.payments.ipn(input);
  }
}
