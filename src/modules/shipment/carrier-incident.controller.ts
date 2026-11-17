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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/fulfillment/carrier-incidents')
export class CarrierIncidentController {
  constructor(private readonly incidentsService: CarrierIncidentService) {}

  @Get()
  @Serialize(z.array(carrierIncidentSchema))
  incidents(
    @Query({ schema: fulfillmentListSchema }) input: FulfillmentListInput,
  ) {
    return this.incidentsService.incidents(input);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Serialize(carrierIncidentSchema)
  decide(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: carrierIncidentDecisionSchema })
    input: CarrierIncidentDecision,
  ) {
    return this.incidentsService.decide(user.id, id, input);
  }
}
