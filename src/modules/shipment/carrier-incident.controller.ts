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

import { CarrierIncidentService } from './carrier-incident.service';
import {
  carrierIncidentDecisionSchema,
  carrierIncidentSchema,
} from './schemas/carrier-incident.schema';
import { fulfillmentListSchema } from './schemas/fulfillment-list.schema';
import type { CarrierIncidentDecision } from './types/shipment.type';
import type { FulfillmentListInput } from './types/shipment.type';

@ApiTags('Fulfillment recovery')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/fulfillment/carrier-incidents')
export class CarrierIncidentController {
  constructor(
    private readonly carrierIncidentService: CarrierIncidentService,
  ) {}

  @AuthenticatedAccess()
  @Get()
  @Serialize(z.array(carrierIncidentSchema))
  incidents(
    @Query({ schema: fulfillmentListSchema }) input: FulfillmentListInput,
  ) {
    return this.carrierIncidentService.incidents(input);
  }

  @AuthenticatedAccess()
  @Post(':id/decision')
  @HttpCode(200)
  @Serialize(carrierIncidentSchema)
  decide(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: carrierIncidentDecisionSchema })
    input: CarrierIncidentDecision,
  ) {
    return this.carrierIncidentService.decide(user.id, id, input);
  }
}
