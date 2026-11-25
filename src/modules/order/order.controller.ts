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

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { User } from '@/modules/user/entities';

import { OrderService } from './order.service';
import type { RejectOrderInput } from './schemas/order.schema';
import {
  acceptOrderSchema,
  orderListInputSchema,
  orderListSchema,
  orderSchema,
  rejectOrderSchema,
} from './schemas/order.schema';
import type { OrderListInput } from './schemas/order.schema';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @AuthenticatedAccess()
  @Get('orders/mine')
  @Serialize(orderListSchema)
  buyerList(
    @CurrentUser() user: User,
    @Query({ schema: orderListInputSchema }) input: OrderListInput,
  ) {
    return this.orderService.buyerList(user.id, input);
  }

  @AuthenticatedAccess()
  @Get('orders/:id')
  @Serialize(orderSchema)
  buyerDetail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.orderService.buyerDetail(user.id, id);
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_VIEW)
  @Get('shops/:shopId/orders')
  @Serialize(orderListSchema)
  shopList(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Query({ schema: orderListInputSchema }) input: OrderListInput,
  ) {
    return this.orderService.shopList(user.id, shopId, input);
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_VIEW)
  @Get('shops/:shopId/orders/:id')
  @Serialize(orderSchema)
  shopDetail(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.orderService.shopDetail(user.id, shopId, id);
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_UPDATE)
  @Post('shops/:shopId/orders/:id/accept')
  @HttpCode(200)
  @Serialize(orderSchema)
  accept(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.orderService.accept(user.id, shopId, id);
  }

  @RequirePermission(SHOP_PERMISSIONS.ORDER_UPDATE)
  @Post('shops/:shopId/orders/:id/reject')
  @HttpCode(200)
  @Serialize(orderSchema)
  reject(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: rejectOrderSchema }) input: RejectOrderInput,
  ) {
    return this.orderService.reject(user.id, shopId, id, input);
  }
}
