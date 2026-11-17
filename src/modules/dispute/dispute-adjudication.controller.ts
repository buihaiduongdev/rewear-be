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

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { DisputeAdjudicationService } from './dispute-adjudication.service';
import {
  disputeAdminReviewSchema,
  disputeDecisionInputSchema,
  disputeDecisionViewSchema,
} from './schemas/dispute-decision.schema';
import { disputeListSchema } from './schemas/dispute.schema';
import type { DisputeDecisionInput } from './types/dispute-decision.type';

@ApiTags('Dispute adjudication')
@ApiBearerAuth()
@AuthenticatedAccess()
@Roles(UserRole.ADMIN)
@Controller('admin/dispute-issues')
export class DisputeAdjudicationController {
  constructor(private readonly adjudication: DisputeAdjudicationService) {}

  @Get(':id/review')
  @Serialize(disputeAdminReviewSchema)
  review(
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: disputeListSchema }) input: { offset: number },
  ) {
    return this.adjudication.review(id, input.offset);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Serialize(disputeDecisionViewSchema)
  decide(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeDecisionInputSchema }) input: DisputeDecisionInput,
  ) {
    return this.adjudication.decide(user.id, id, input);
  }
}
