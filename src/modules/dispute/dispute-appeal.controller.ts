import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { acceptOrderSchema } from '@/modules/order/schemas/order.schema';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { DisputeAppealService } from './dispute-appeal.service';
import {
  disputeAppealViewSchema,
  disputeFinalDecisionViewSchema,
} from './schemas/dispute-appeal-view.schema';
import {
  disputeAppealAdminReviewSchema,
  disputeAppealConclusionSchema,
  disputeAppealInputSchema,
} from './schemas/dispute-appeal.schema';
import type {
  DisputeAppealConclusionInput,
  DisputeAppealInput,
} from './schemas/dispute-appeal.schema';

@ApiTags('Dispute appeals')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class DisputeAppealController {
  constructor(private readonly appeals: DisputeAppealService) {}

  @Post('dispute-decisions/:id/appeals')
  @HttpCode(200)
  @Serialize(disputeAppealViewSchema)
  submit(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeAppealInputSchema }) input: DisputeAppealInput,
  ) {
    return this.appeals.submit(user.id, id, input);
  }

  @Get('admin/dispute-decisions/:id/appeal-review')
  @Roles(UserRole.ADMIN)
  @Serialize(disputeAppealAdminReviewSchema)
  review(@Param('id', { schema: uuidSchema }) id: string) {
    return this.appeals.review(id);
  }

  @Post('admin/dispute-decisions/:id/appeal-review/refresh')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(disputeAppealAdminReviewSchema)
  refresh(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.appeals.refresh(id);
  }

  @Post('admin/dispute-decisions/:id/appeal-decision')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(disputeFinalDecisionViewSchema)
  conclude(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeAppealConclusionSchema })
    input: DisputeAppealConclusionInput,
  ) {
    return this.appeals.conclude(user.id, id, input);
  }
}
