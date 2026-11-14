import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';
import {
  acceptOrderSchema,
  orderSchema,
  rejectOrderSchema,
} from '@/modules/order/order.schema';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import {
  cancellationDecisionSchema,
  fulfillmentIncidentsSchema,
  labelViewSchema,
  shipmentCreateSchema,
  shipmentViewSchema,
} from './schemas/shipment.schema';
import type {
  CancellationDecision,
  ShipmentCreateInput,
} from './schemas/shipment.schema';
import { ShipmentCancellationService } from './shipment-cancellation.service';
import { ShipmentService } from './shipment.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ShipmentController {
  constructor(
    private readonly shipments: ShipmentService,
    private readonly cancellations: ShipmentCancellationService,
  ) {}

  @Post('shops/:shopId/orders/:id/shipment')
  @HttpCode(200)
  @Serialize(shipmentViewSchema)
  create(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: shipmentCreateSchema }) input: ShipmentCreateInput,
  ) {
    return this.shipments.create(user.id, shopId, id, input);
  }

  @Get('shops/:shopId/orders/:id/shipment')
  @Serialize(shipmentViewSchema)
  shopView(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shipments.shopView(user.id, shopId, id);
  }

  @Get('orders/:id/shipment')
  @Serialize(shipmentViewSchema)
  buyerView(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shipments.buyerView(user.id, id);
  }

  @Post('orders/:id/shipment/reconcile')
  @HttpCode(200)
  @Serialize(shipmentViewSchema)
  reconcile(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.shipments.reconcileBuyer(user.id, id);
  }

  @Get('admin/fulfillment/incidents')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Serialize(fulfillmentIncidentsSchema)
  incidents() {
    return this.shipments.incidents();
  }

  @Post('shops/:shopId/orders/:id/shipment/label')
  @HttpCode(200)
  @Serialize(labelViewSchema)
  label(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.shipments.label(user.id, shopId, id);
  }

  @Post('orders/:id/cod/cancellation-request')
  @HttpCode(200)
  @Serialize(orderSchema)
  request(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.cancellations.request(user.id, id);
  }

  @Post('shops/:shopId/orders/:id/cod/cancellation-response')
  @HttpCode(200)
  @Serialize(orderSchema)
  respond(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: cancellationDecisionSchema }) input: CancellationDecision,
  ) {
    return this.cancellations.respond(user.id, shopId, id, input);
  }

  @Post('orders/:id/cod/cancellation-review')
  @HttpCode(200)
  @Serialize(orderSchema)
  review(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: rejectOrderSchema }) input: { reason: string },
  ) {
    return this.cancellations.requestReview(user.id, id, input.reason);
  }

  @Post('admin/orders/:id/cod/cancellation-decision')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Serialize(orderSchema)
  decide(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: cancellationDecisionSchema }) input: CancellationDecision,
  ) {
    return this.cancellations.adminDecision(user.id, id, input);
  }
}
