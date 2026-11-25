import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { PayosClient } from '@/infrastructure/payment/payos.client';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
import { FeePaymentService } from '@/modules/fees/payments/fee-payment.service';
import { User } from '@/modules/user/entities';
import { ExcessPaymentService } from '@/modules/wallet/excess/payments/excess-payment.service';

import { PAYOS_CLIENT } from './payment.config';
import { PaymentService } from './payment.service';
import type {
  CreatePaymentInput,
  PayosWebhookBody,
} from './schemas/payment.schema';
import {
  createPaymentSchema,
  paymentViewSchema,
  payosWebhookSchema,
} from './schemas/payment.schema';

@ApiTags('Payments')
@Controller()
export class PaymentController {
  constructor(
    @Inject(PAYOS_CLIENT) private readonly payosClient: PayosClient | null,
    private readonly paymentService: PaymentService,
    private readonly feePayments: FeePaymentService,
    private readonly excessPayments: ExcessPaymentService,
  ) {}

  @AuthenticatedAccess()
  @Post('checkouts/:id/payments/payos')
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
  @Post('payments/payos/webhook')
  @HttpCode(200)
  async webhook(@Body({ schema: payosWebhookSchema }) input: PayosWebhookBody) {
    if (!this.payosClient) {
      throw new ServiceUnavailableException('PayOS gateway is disabled');
    }
    let verified;
    try {
      verified = await this.payosClient.verifyWebhook(input);
    } catch {
      throw new UnauthorizedException('Invalid PayOS webhook');
    }
    if (verified.isTestPing) {
      return { success: true };
    }
    const orderCode = String(verified.orderCode);
    if (await this.excessPayments.handlesOrderCode(orderCode)) {
      await this.excessPayments.applyWebhook(verified);
    } else if (await this.feePayments.handlesOrderCode(orderCode)) {
      await this.feePayments.applyWebhook(verified);
    } else {
      await this.paymentService.applyWebhook(verified);
    }
    return { success: true };
  }
}
