import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { DisputeRefundReadService } from './dispute-refund-read.service';
import { DisputeRefundService } from './dispute-refund.service';
import {
  refundConsentSchema,
  refundDetailViewSchema,
  refundExecutionViewSchema,
  refundIncidentSchema,
  refundIncidentViewSchema,
} from './schemas/refund-execution.schema';

@ApiTags('Dispute refunds')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class DisputeRefundController {
  constructor(
    private readonly refunds: DisputeRefundService,
    private readonly reads: DisputeRefundReadService,
  ) {}
  @Get('dispute-final-decisions/:id/refund')
  @Serialize(refundDetailViewSchema)
  view(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.reads.view(user.id, id);
  }
  @Get('admin/dispute-final-decisions/:id/refund')
  @Roles(UserRole.ADMIN)
  @Serialize(refundDetailViewSchema)
  adminView(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.reads.view(user.id, id, true);
  }
  @Post('dispute-final-decisions/:id/refund/consents')
  @HttpCode(200)
  @Serialize(refundExecutionViewSchema)
  consent(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: refundConsentSchema })
    input: z.output<typeof refundConsentSchema>,
  ) {
    return this.refunds.consent(user.id, id, input);
  }
  @Post('admin/dispute-final-decisions/:id/refund/refresh')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(refundExecutionViewSchema.nullable())
  refresh(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: z.strictObject({}) }) _input: Record<string, never>,
  ) {
    return this.refunds.refresh(id);
  }
  @Post('admin/dispute-refunds/:id/incident-updates')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(refundIncidentViewSchema)
  incident(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: refundIncidentSchema })
    input: z.output<typeof refundIncidentSchema>,
  ) {
    return this.reads.incident(user.id, id, input);
  }
}
