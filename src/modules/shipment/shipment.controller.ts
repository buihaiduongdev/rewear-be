import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import type { RejectOrderInput } from '@/modules/order/schemas/order.schema';
import {
  acceptOrderSchema,
  orderSchema,
  rejectOrderSchema,
} from '@/modules/order/schemas/order.schema';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import {
  returnInspectionSchema,
  returnInspectionViewSchema,
} from './schemas/return-inspection.schema';
import {
  cancellationDecisionSchema,
  fulfillmentIncidentsSchema,
  labelViewSchema,
  shipmentCreateSchema,
  shipmentViewSchema,
} from './schemas/shipment.schema';
import type { ReturnInspectionInput } from './schemas/shipment.schema';
import type {
  CancellationDecision,
  ShipmentCreateInput,
} from './schemas/shipment.schema';
import { ShipmentCancellationService } from './shipment-cancellation.service';
import { ShipmentReturnInspectionService } from './shipment-return-inspection.service';
import { ShipmentService } from './shipment.service';

@ApiTags('Shipments')
@ApiBearerAuth()
@Controller()
export class ShipmentController {
  constructor(
    private readonly shipmentService: ShipmentService,
    private readonly shipmentCancellationService: ShipmentCancellationService,
    private readonly shipmentReturnInspectionService: ShipmentReturnInspectionService,
  ) {}

  @RequirePermission(SHOP_PERMISSIONS.ORDER_UPDATE)
  @Post('shops/:shopId/orders/:id/shipment/return-inspection')
  @HttpCode(200)
  @Serialize(returnInspectionViewSchema)
  inspect(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnInspectionSchema }) input: ReturnInspectionInput,
  ) {
    return this.shipmentReturnInspectionService.inspect(
      user.id,
      shopId,
      id,
      input,
    );
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_UPDATE)
  @Post('shops/:shopId/orders/:id/shipment')
  @HttpCode(200)
  @Serialize(shipmentViewSchema)
  create(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: shipmentCreateSchema }) input: ShipmentCreateInput,
  ) {
    return this.shipmentService.create(user.id, shopId, id, input);
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_VIEW)
  @Get('shops/:shopId/orders/:id/shipment')
  @Serialize(shipmentViewSchema)
  shopView(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shipmentService.shopView(user.id, shopId, id);
  }

  @AuthenticatedAccess()
  @Get('orders/:id/shipment')
  @Serialize(shipmentViewSchema)
  buyerView(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shipmentService.buyerView(user.id, id);
  }

  @AuthenticatedAccess()
  @Post('orders/:id/shipment/reconcile')
  @HttpCode(200)
  @Serialize(shipmentViewSchema)
  reconcile(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.shipmentService.reconcileBuyer(user.id, id);
  }

  @AuthenticatedAccess()
  @Get('admin/fulfillment/incidents')
  @Roles(UserRole.ADMIN)
  @Serialize(fulfillmentIncidentsSchema)
  incidents() {
    return this.shipmentService.incidents();
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_UPDATE)
  @Post('shops/:shopId/orders/:id/shipment/label')
  @HttpCode(200)
  @Serialize(labelViewSchema)
  label(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.shipmentService.label(user.id, shopId, id);
  }

  @AuthenticatedAccess()
  @Post('orders/:id/cod/cancellation-request')
  @HttpCode(200)
  @Serialize(orderSchema)
  request(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.shipmentCancellationService.request(user.id, id);
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_UPDATE)
  @Post('shops/:shopId/orders/:id/cod/cancellation-response')
  @HttpCode(200)
  @Serialize(orderSchema)
  respond(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: cancellationDecisionSchema }) input: CancellationDecision,
  ) {
    return this.shipmentCancellationService.respond(user.id, shopId, id, input);
  }

  @AuthenticatedAccess()
  @Post('orders/:id/cod/cancellation-review')
  @HttpCode(200)
  @Serialize(orderSchema)
  review(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: rejectOrderSchema }) input: RejectOrderInput,
  ) {
    return this.shipmentCancellationService.requestReview(user.id, id, input);
  }

  @AuthenticatedAccess()
  @Post('admin/orders/:id/cod/cancellation-decision')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(orderSchema)
  decide(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: cancellationDecisionSchema }) input: CancellationDecision,
  ) {
    return this.shipmentCancellationService.adminDecision(user.id, id, input);
  }
}
