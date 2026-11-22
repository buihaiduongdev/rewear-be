import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { ExcessOperationsService } from './excess-operations.service';
import { ExcessPaymentService } from './payments/excess-payment.service';
import {
  excessCommandViewSchema,
  excessCorrectSchema,
  excessIncidentSchema,
  excessObjectSchema,
  excessPageSchema,
  excessPaymentViewSchema,
  excessPaySchema,
  excessQuerySchema,
  excessRefundQueueSchema,
  excessResponseSchema,
  excessVerifySchema,
  excessViewSchema,
  excessWithdrawSchema,
} from './schemas/excess.schema';
import { WalletExcessService } from './wallet-excess.service';

@ApiTags('Wallet recovery')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('wallet/recoveries')
export class WalletExcessController {
  constructor(
    private readonly recovery: WalletExcessService,
    private readonly operations: ExcessOperationsService,
    private readonly payments: ExcessPaymentService,
  ) {}
  @Get('mine')
  @Serialize(excessPageSchema)
  mine(
    @CurrentUser() user: User,
    @Query({ schema: excessQuerySchema })
    input: z.input<typeof excessQuerySchema>,
  ) {
    return this.recovery.list(user.id, input);
  }
  @Post('payments/momo')
  @HttpCode(200)
  @Serialize(excessPaymentViewSchema)
  pay(
    @CurrentUser() user: User,
    @Body({ schema: excessPaySchema }) input: z.input<typeof excessPaySchema>,
  ) {
    return this.payments.create(user.id, input);
  }
  @Get('payments/:id')
  @Serialize(excessPaymentViewSchema)
  payment(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.payments.view(user.id, id);
  }
  @Get('admin')
  @Roles(UserRole.ADMIN)
  @Serialize(excessPageSchema)
  queue(
    @CurrentUser() user: User,
    @Query({ schema: excessQuerySchema })
    input: z.input<typeof excessQuerySchema>,
  ) {
    return this.recovery.list(user.id, input, true);
  }
  @Get('admin/refunds')
  @Roles(UserRole.ADMIN)
  @Serialize(excessRefundQueueSchema)
  refunds(@CurrentUser() user: User) {
    return this.operations.refundQueue(user.id);
  }
  @Post('admin/refunds/:id/responses')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(excessCommandViewSchema)
  refundResponse(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: excessIncidentSchema })
    input: z.input<typeof excessIncidentSchema>,
  ) {
    return this.operations.respondRefund(user.id, id, input);
  }
  @Post('admin')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(excessViewSchema)
  verify(
    @CurrentUser() user: User,
    @Body({ schema: excessVerifySchema })
    input: z.input<typeof excessVerifySchema>,
  ) {
    return this.recovery.verify(user.id, input);
  }
  @Get('admin/:id')
  @Roles(UserRole.ADMIN)
  @Serialize(excessViewSchema)
  adminDetail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.recovery.find(user.id, id, true);
  }
  @Post('admin/:id/corrections')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(excessViewSchema)
  correct(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: excessCorrectSchema })
    input: z.input<typeof excessCorrectSchema>,
  ) {
    return this.recovery.correct(user.id, id, input);
  }
  @Post('admin/:id/evidence-requests')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(excessCommandViewSchema)
  requestEvidence(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: excessResponseSchema })
    input: z.input<typeof excessResponseSchema>,
  ) {
    return this.operations.requestEvidence(user.id, id, input);
  }
  @Post('admin/:id/responses')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(excessCommandViewSchema)
  response(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: excessIncidentSchema })
    input: z.input<typeof excessIncidentSchema>,
  ) {
    return this.operations.respond(user.id, id, input);
  }
  @Get(':id')
  @Serialize(excessViewSchema)
  detail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.recovery.find(user.id, id);
  }
  @Post(':id/objections')
  @HttpCode(200)
  @Serialize(excessViewSchema)
  object(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: excessObjectSchema })
    input: z.input<typeof excessObjectSchema>,
  ) {
    return this.recovery.object(user.id, id, input);
  }
  @Post(':id/objections/withdraw')
  @HttpCode(200)
  @Serialize(excessCommandViewSchema)
  withdraw(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: excessWithdrawSchema })
    input: z.input<typeof excessWithdrawSchema>,
  ) {
    return this.operations.withdraw(user.id, id, input);
  }
  @Post(':id/supplements')
  @HttpCode(200)
  @Serialize(excessCommandViewSchema)
  supplement(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: excessObjectSchema })
    input: z.input<typeof excessObjectSchema>,
  ) {
    return this.operations.supplement(user.id, id, input);
  }
}
