import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { ReturnCarrierService } from './return-carrier.service';
import { ReturnExceptionReadService } from './return-exception-read.service';
import { ReturnSafetyService } from './return-safety.service';
import {
  carrierAcknowledgementSchema,
  carrierAcknowledgementViewSchema,
  carrierExceptionSchema,
  carrierExceptionViewSchema,
  carrierReceiptSchema,
  carrierReceiptViewSchema,
  returnExceptionDetailSchema,
  returnShippingChargeSchema,
  returnShippingChargeViewSchema,
  safetyConfirmSchema,
  safetyExecutionSchema,
  safetyWaiverSchema,
  safetyWaiverViewSchema,
} from './schemas/return-exception.schema';

@ApiTags('Return exceptions and carrier claims')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class ReturnExceptionController {
  constructor(
    private readonly safety: ReturnSafetyService,
    private readonly carrier: ReturnCarrierService,
    private readonly reads: ReturnExceptionReadService,
  ) {}
  @Get('dispute-final-decisions/:id/return-exceptions')
  @Serialize(returnExceptionDetailSchema)
  read(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.reads.read(u.id, id);
  }
  @Get('admin/dispute-final-decisions/:id/return-exceptions')
  @Roles(UserRole.ADMIN)
  @Serialize(returnExceptionDetailSchema)
  review(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.reads.read(u.id, id, true);
  }
  @Post('admin/dispute-final-decisions/:id/safety-waiver')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(safetyWaiverViewSchema)
  authorize(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: safetyWaiverSchema }) input: unknown,
  ) {
    return this.safety.authorize(u.id, id, input);
  }
  @Post('dispute-final-decisions/:id/safety-waiver/execution')
  @HttpCode(200)
  @Serialize(safetyWaiverViewSchema)
  submit(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: safetyExecutionSchema }) input: unknown,
  ) {
    return this.safety.submit(u.id, id, input);
  }
  @Post('admin/dispute-final-decisions/:id/safety-waiver/verify')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(safetyWaiverViewSchema)
  confirm(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: safetyConfirmSchema }) input: unknown,
  ) {
    return this.safety.confirm(u.id, id, input);
  }
  @Post('admin/dispute-final-decisions/:id/carrier-exceptions')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(carrierExceptionViewSchema)
  verifyCarrier(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: carrierExceptionSchema }) input: unknown,
  ) {
    return this.carrier.verify(u.id, id, input);
  }
  @Post('admin/carrier-compensation-claims/:id/acknowledgement')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(carrierAcknowledgementViewSchema)
  acknowledge(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: carrierAcknowledgementSchema }) input: unknown,
  ) {
    return this.carrier.acknowledge(u.id, id, input);
  }
  @Post('admin/carrier-compensation-claims/:id/receipts')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(carrierReceiptViewSchema)
  receipt(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: carrierReceiptSchema }) input: unknown,
  ) {
    return this.carrier.receive(u.id, id, input);
  }
  @Post('admin/dispute-final-decisions/:id/return-shipping-charges')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(returnShippingChargeViewSchema)
  charge(
    @CurrentUser() u: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnShippingChargeSchema }) input: unknown,
  ) {
    return this.carrier.charge(u.id, id, input);
  }
}
