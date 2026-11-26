import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { OrderService } from '@/modules/order/order.service';
import type { RejectOrderInput } from '@/modules/order/schemas/order.schema';
import {
  orderListSchema,
  orderSchema,
  rejectOrderSchema,
} from '@/modules/order/schemas/order.schema';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { CodService } from './cod.service';
import { CodPolicy } from './policies/cod.policy';
import {
  cancelCodSchema,
  codRestrictionsSchema,
  placeCodSchema,
} from './schemas/cod.schema';
import type { CancelCodInput, PlaceCodInput } from './schemas/cod.schema';

@ApiTags('COD')
@ApiBearerAuth()
@Controller()
export class CodController {
  constructor(
    private readonly codService: CodService,
    private readonly orderService: OrderService,
    private readonly policy: CodPolicy,
  ) {}

  @AuthenticatedAccess()
  @Post('checkouts/:id/orders/cod')
  @HttpCode(200)
  @Serialize(orderListSchema)
  place(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: placeCodSchema }) input: PlaceCodInput,
  ) {
    return this.codService.place(user.id, id, input);
  }

  @AuthenticatedAccess()
  @Post('orders/:id/cod/cancel')
  @HttpCode(200)
  @Serialize(orderSchema)
  cancel(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: cancelCodSchema }) _input: CancelCodInput,
  ) {
    return this.orderService.cancelCodPending(user.id, id);
  }

  @AuthenticatedAccess()
  @Get('cod/restrictions/mine')
  @Serialize(codRestrictionsSchema)
  mine(@CurrentUser() user: User) {
    return this.policy.mine(user.id);
  }

  @AuthenticatedAccess()
  @Post('admin/cod/restrictions/:id/resolve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  resolve(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: rejectOrderSchema }) input: RejectOrderInput,
  ) {
    return this.policy.resolve(user.id, id, input);
  }
}
