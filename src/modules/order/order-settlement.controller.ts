import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { OrderSettlementService } from './order-settlement.service';
import { verifyDeliverySchema } from './schemas/order-settlement.schema';
import { acceptOrderSchema, orderSchema } from './schemas/order.schema';
import type { VerifyDeliveryInput } from './types/order-settlement.type';

@ApiTags('Order receipt and settlement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrderSettlementController {
  constructor(private readonly settlement: OrderSettlementService) {}

  @Post('orders/:id/confirm-receipt')
  @HttpCode(200)
  @Serialize(orderSchema)
  confirmReceipt(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.settlement.confirmReceipt(user.id, id);
  }

  @Post('admin/orders/:id/delivery-verification')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(orderSchema)
  verifyDelivery(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: verifyDeliverySchema }) input: VerifyDeliveryInput,
  ) {
    return this.settlement.verifyDelivery(user.id, id, input);
  }
}
