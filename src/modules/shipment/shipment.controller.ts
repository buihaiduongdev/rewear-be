import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
import { acceptOrderSchema } from '@/modules/order/schemas/order.schema';
import { User } from '@/modules/user/entities';

import {
  ghnWebhookSchema,
  labelViewSchema,
  shipmentCreateSchema,
  shipmentViewSchema,
} from './schemas/shipment.schema';
import type {
  GhnWebhookInput,
  ShipmentCreateInput,
} from './schemas/shipment.schema';
import { ShipmentService } from './shipment.service';

@ApiTags('Shipments')
@Controller()
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @ApiBearerAuth()
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

  @ApiBearerAuth()
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

  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Get('orders/:id/shipment')
  @Serialize(shipmentViewSchema)
  buyerView(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shipmentService.buyerView(user.id, id);
  }

  @ApiBearerAuth()
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

  @ApiBearerAuth()
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

  @PublicAccess()
  @Post('shipments/ghn/webhook')
  @HttpCode(200)
  webhook(@Body({ schema: ghnWebhookSchema }) input: GhnWebhookInput) {
    return this.shipmentService.webhook(input);
  }
}
