import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { FeePaymentService } from './fee-payment.service';
import {
  feePaymentViewSchema,
  feeRefundOperationsListSchema,
  feeRefundResponseViewSchema,
} from './schemas/fee-payment.schema';
import { refundResponseSchema } from './schemas/fee-payment.schema';
import {
  type CreateFeePaymentInput,
  createFeePaymentSchema,
} from './schemas/fee-payment.schema';

@ApiTags('Fee payments')
@ApiBearerAuth()
@Controller('fee-payments')
export class FeePaymentController {
  constructor(private readonly payments: FeePaymentService) {}
  @AuthenticatedAccess()
  @Serialize(feePaymentViewSchema)
  @Post('momo')
  @HttpCode(200)
  create(
    @CurrentUser() user: User,
    @Body({ schema: createFeePaymentSchema }) input: CreateFeePaymentInput,
  ) {
    return this.payments.create(user.id, input);
  }
  @AuthenticatedAccess()
  @Get('refunds/pending')
  @Serialize(feeRefundOperationsListSchema)
  pendingRefunds(@CurrentUser() user: User) {
    return this.payments.pendingRefunds(user.id);
  }
  @AuthenticatedAccess()
  @Serialize(feePaymentViewSchema)
  @Get(':id')
  view(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.payments.view(user.id, id);
  }
  @AuthenticatedAccess()
  @Serialize(feePaymentViewSchema)
  @Post(':id/reconcile')
  @HttpCode(200)
  async reconcile(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    await this.payments.view(user.id, id);
    await this.payments.queryAttempt(id);
    return this.payments.view(user.id, id);
  }
  @AuthenticatedAccess()
  @Serialize(feeRefundResponseViewSchema)
  @Post('refunds/:id/response')
  @HttpCode(200)
  respond(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: refundResponseSchema }) input: { message: string },
  ) {
    return this.payments.respondToRefund(user.id, id, input.message);
  }
}
