import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { OrderSettlementService } from './order-settlement.service';
import {
  acceptOrderSchema,
  orderSchema,
  type VerifyDeliveryInput,
  verifyDeliverySchema,
} from './schemas/order.schema';

@ApiTags('Order receipt and settlement')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class OrderSettlementController {
  constructor(
    private readonly orderSettlementService: OrderSettlementService,
  ) {}

  @Post('orders/:id/confirm-receipt')
  @HttpCode(200)
  @Serialize(orderSchema)
  confirmReceipt(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.orderSettlementService.confirmReceipt(user.id, id);
  }

  @Post('admin/orders/:id/delivery-verification')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(orderSchema)
  verifyDelivery(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: verifyDeliverySchema }) input: VerifyDeliveryInput,
  ) {
    return this.orderSettlementService.verifyDelivery(user.id, id, input);
  }
}
