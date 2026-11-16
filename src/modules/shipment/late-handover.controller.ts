import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { LateHandoverService } from './late-handover.service';
import { fulfillmentListSchema } from './schemas/fulfillment-list.schema';
import {
  fulfillmentCalendarSchema,
  fulfillmentNoticeSchema,
  handoverCaseSchema,
  handoverProposalSchema,
  handoverResponseSchema,
  handoverStopSchema,
} from './schemas/late-handover.schema';
import type {
  CalendarInput,
  HandoverProposal,
  HandoverStop,
} from './types/late-handover.type';
import type { FulfillmentListInput } from './types/shipment.type';

@ApiTags('Fulfillment recovery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class LateHandoverController {
  constructor(private readonly handovers: LateHandoverService) {}

  @Post('admin/orders/:id/handover/stop')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Serialize(handoverCaseSchema)
  stop(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: handoverStopSchema }) input: HandoverStop,
  ) {
    return this.handovers.adminStop(user.id, id, input);
  }

  @Get('fulfillment/notices')
  @Serialize(z.array(fulfillmentNoticeSchema))
  notices(
    @CurrentUser() user: User,
    @Query({ schema: fulfillmentListSchema }) input: FulfillmentListInput,
  ) {
    return this.handovers.notices(user.id, input);
  }

  @Post('admin/fulfillment/calendar')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  configureCalendar(
    @CurrentUser() user: User,
    @Body({ schema: fulfillmentCalendarSchema }) input: CalendarInput,
  ) {
    return this.handovers.configureCalendar(user.id, input);
  }

  @Get('admin/fulfillment/handovers')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Serialize(z.array(handoverCaseSchema))
  incidents(
    @Query({ schema: fulfillmentListSchema }) input: FulfillmentListInput,
  ) {
    return this.handovers.incidents(input);
  }

  @Get('orders/:id/handover')
  @Serialize(handoverCaseSchema)
  buyerView(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.handovers.buyerView(user.id, id);
  }

  @Get('shops/:shopId/orders/:id/handover')
  @Serialize(handoverCaseSchema)
  shopView(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.handovers.shopView(user.id, shopId, id);
  }

  @Post('admin/orders/:id/handover/proposal')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Serialize(handoverCaseSchema)
  propose(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: handoverProposalSchema }) input: HandoverProposal,
  ) {
    return this.handovers.propose(user.id, id, input);
  }

  @Post('orders/:id/handover/response')
  @HttpCode(200)
  @Serialize(handoverCaseSchema)
  respond(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: handoverResponseSchema }) input: { accept: boolean },
  ) {
    return this.handovers.respond(user.id, id, input.accept);
  }
}
