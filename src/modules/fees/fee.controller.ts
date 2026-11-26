import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { FeeService } from './fee.service';
import {
  feeAdminQueueSchema,
  feeAssessmentSchema,
  feeCorrectionSchema,
  feeHistorySchema,
  feeObjectionSchema,
  feeViewSchema,
} from './schemas/fee.schema';
import type {
  FeeAdminQueueInput,
  FeeAssessmentInput,
  FeeCorrectionInput,
  FeeObjectionInput,
} from './schemas/fee.schema';

@ApiTags('Fees')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('fees')
export class FeeController {
  constructor(private readonly fees: FeeService) {}
  @Get('admin/queue')
  adminQueue(
    @CurrentUser() user: User,
    @Query({ schema: feeAdminQueueSchema }) input: FeeAdminQueueInput,
  ) {
    return this.fees.adminQueue(user.id, input.offset);
  }
  @Post()
  @Serialize(feeViewSchema)
  assess(
    @CurrentUser() user: User,
    @Body({ schema: feeAssessmentSchema })
    input: FeeAssessmentInput,
  ) {
    return this.fees.assess(user.id, input);
  }
  @Get()
  @Serialize(feeViewSchema.array())
  list(@CurrentUser() user: User) {
    return this.fees.list(user.id);
  }
  @Get('shop/:shopId')
  @Serialize(feeViewSchema.array())
  shop(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.fees.list(user.id, shopId);
  }
  @Get(':id/history')
  @Serialize(feeHistorySchema)
  history(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.fees.historyFor(user.id, id);
  }
  @Get(':id')
  @Serialize(feeViewSchema)
  get(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.fees.get(user.id, id);
  }
  @Post(':id/objections')
  @Serialize(feeViewSchema)
  object(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: feeObjectionSchema })
    input: FeeObjectionInput,
  ) {
    return this.fees.object(user.id, id, input);
  }
  @Post(':id/corrections')
  @Serialize(feeViewSchema)
  correct(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: feeCorrectionSchema })
    input: FeeCorrectionInput,
  ) {
    return this.fees.correct(user.id, id, input);
  }
}
