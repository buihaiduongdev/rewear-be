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

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import {
  acceptOrderSchema,
  orderListInputSchema,
  orderListSchema,
  orderSchema,
  rejectOrderSchema,
} from './order.schema';
import { OrderService } from './order.service';
import type { OrderListInput } from './order.type';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get('orders/mine')
  @Serialize(orderListSchema)
  buyerList(
    @CurrentUser() user: User,
    @Query({ schema: orderListInputSchema }) input: OrderListInput,
  ) {
    return this.orders.buyerList(user.id, input);
  }

  @Get('orders/:id')
  @Serialize(orderSchema)
  buyerDetail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.orders.buyerDetail(user.id, id);
  }

  @Get('shops/:shopId/orders')
  @Serialize(orderListSchema)
  shopList(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Query({ schema: orderListInputSchema }) input: OrderListInput,
  ) {
    return this.orders.shopList(user.id, shopId, input);
  }

  @Get('shops/:shopId/orders/:id')
  @Serialize(orderSchema)
  shopDetail(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.orders.shopDetail(user.id, shopId, id);
  }

  @Post('shops/:shopId/orders/:id/accept')
  @HttpCode(200)
  @Serialize(orderSchema)
  accept(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.orders.accept(user.id, shopId, id);
  }

  @Post('shops/:shopId/orders/:id/reject')
  @HttpCode(200)
  @Serialize(orderSchema)
  reject(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: rejectOrderSchema }) input: { reason: string },
  ) {
    return this.orders.reject(user.id, shopId, id, input.reason);
  }
}
