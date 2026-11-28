import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { PayosClient } from '@/infrastructure/payment/payos.client';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { PAYMENT_PROVIDER } from './constants/payment.constant';
import { MomoClient } from './momo.client';
import { MOMO_CLIENT, PAYOS_CLIENT } from './payment.config';
import { PaymentService } from './payment.service';
import type {
  AdminPaymentRefundQuery,
  CreatePaymentInput,
  MomoIpnBody,
  PayosWebhookBody,
  ResolvePaymentRefundInput,
} from './schemas/payment.schema';
import {
  adminPaymentRefundItemSchema,
  adminPaymentRefundListSchema,
  adminPaymentRefundQuerySchema,
  createPaymentSchema,
  momoIpnSchema,
  paymentViewSchema,
  payosWebhookSchema,
  resolvePaymentRefundSchema,
} from './schemas/payment.schema';

@ApiTags('Payments')
@Controller()
export class PaymentController {
  constructor(
    @Inject(PAYOS_CLIENT) private readonly payosClient: PayosClient | null,
    private readonly paymentService: PaymentService,
    @Inject(MOMO_CLIENT) private readonly momoClient: MomoClient | null,
  ) {}

  @AuthenticatedAccess()
  @Post('checkouts/:id/payments/payos')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create PayOS payment link for a held checkout' })
  @Serialize(paymentViewSchema)
  create(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: createPaymentSchema }) input: CreatePaymentInput,
  ) {
    return this.paymentService.create(
      user.id,
      id,
      input,
      PAYMENT_PROVIDER.PAYOS,
    );
  }

  @AuthenticatedAccess()
  @Post('checkouts/:id/payments/momo')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create MoMo Sandbox payment link for a held checkout',
  })
  @Serialize(paymentViewSchema)
  createMomo(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: createPaymentSchema }) input: CreatePaymentInput,
  ) {
    return this.paymentService.create(
      user.id,
      id,
      input,
      PAYMENT_PROVIDER.MOMO,
    );
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
  @ApiOperation({ summary: 'Receive verified PayOS payment webhook' })
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
    await this.paymentService.applyWebhook(verified);
    return { success: true };
  }

  @PublicAccess()
  @Post('payments/momo/ipn')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive verified MoMo Sandbox IPN callback' })
  async momoIpn(@Body({ schema: momoIpnSchema }) input: MomoIpnBody) {
    if (!this.momoClient) {
      throw new ServiceUnavailableException('MoMo gateway is disabled');
    }
    let verified;
    try {
      verified = this.momoClient.verifyIpnSignature(input);
    } catch {
      throw new UnauthorizedException('Invalid MoMo IPN');
    }
    await this.paymentService.applyMomoIpn(verified);
    return { success: true };
  }

  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Get('admin/payments/refunds')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List late-payment refunds for Admin review' })
  @Serialize(adminPaymentRefundListSchema)
  listAdminRefunds(
    @Query({ schema: adminPaymentRefundQuerySchema })
    query: AdminPaymentRefundQuery,
  ) {
    return this.paymentService.listRefundsForAdmin(query);
  }

  @Roles(UserRole.ADMIN)
  @AuthenticatedAccess()
  @Post('admin/payments/refunds/:id/resolve')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Resolve a late-payment refund via wallet credit or manual bank transfer',
  })
  @Serialize(adminPaymentRefundItemSchema)
  resolveAdminRefund(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: resolvePaymentRefundSchema })
    input: ResolvePaymentRefundInput,
  ) {
    return this.paymentService.resolveRefund(user.id, id, input);
  }
}
