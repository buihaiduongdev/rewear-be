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
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { LateHandoverService } from './late-handover.service';
import { fulfillmentListSchema } from './schemas/fulfillment-list.schema';
import type { HandoverResponseInput } from './schemas/late-handover.schema';
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
@Controller()
export class LateHandoverController {
  constructor(private readonly lateHandoverService: LateHandoverService) {}

  @AuthenticatedAccess()
  @Post('admin/orders/:id/handover/stop')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(handoverCaseSchema)
  stop(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: handoverStopSchema }) input: HandoverStop,
  ) {
    return this.lateHandoverService.adminStop(user.id, id, input);
  }

  @AuthenticatedAccess()
  @Get('fulfillment/notices')
  @Serialize(z.array(fulfillmentNoticeSchema))
  notices(
    @CurrentUser() user: User,
    @Query({ schema: fulfillmentListSchema }) input: FulfillmentListInput,
  ) {
    return this.lateHandoverService.notices(user.id, input);
  }

  @AuthenticatedAccess()
  @Post('admin/fulfillment/calendar')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  configureCalendar(
    @CurrentUser() user: User,
    @Body({ schema: fulfillmentCalendarSchema }) input: CalendarInput,
  ) {
    return this.lateHandoverService.configureCalendar(user.id, input);
  }

  @AuthenticatedAccess()
  @Get('admin/fulfillment/handovers')
  @Roles(UserRole.ADMIN)
  @Serialize(z.array(handoverCaseSchema))
  incidents(
    @Query({ schema: fulfillmentListSchema }) input: FulfillmentListInput,
  ) {
    return this.lateHandoverService.incidents(input);
  }

  @AuthenticatedAccess()
  @Get('orders/:id/handover')
  @Serialize(handoverCaseSchema)
  buyerView(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.lateHandoverService.buyerView(user.id, id);
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_VIEW)
  @Get('shops/:shopId/orders/:id/handover')
  @Serialize(handoverCaseSchema)
  shopView(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.lateHandoverService.shopView(user.id, shopId, id);
  }

  @AuthenticatedAccess()
  @Post('admin/orders/:id/handover/proposal')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(handoverCaseSchema)
  propose(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: handoverProposalSchema }) input: HandoverProposal,
  ) {
    return this.lateHandoverService.propose(user.id, id, input);
  }

  @AuthenticatedAccess()
  @Post('orders/:id/handover/response')
  @HttpCode(200)
  @Serialize(handoverCaseSchema)
  respond(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: handoverResponseSchema }) input: HandoverResponseInput,
  ) {
    return this.lateHandoverService.respond(user.id, id, input);
  }
}
