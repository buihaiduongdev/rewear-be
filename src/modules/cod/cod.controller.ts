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
  orderListSchema,
  orderSchema,
  rejectOrderSchema,
} from '@/modules/order/order.schema';
import { OrderService } from '@/modules/order/order.service';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { CodPolicy } from './cod.policy';
import { CodService } from './cod.service';
import type { CancelCodInput, PlaceCodInput } from './schemas/cod.schema';
import {
  cancelCodSchema,
  codRestrictionsSchema,
  placeCodSchema,
} from './schemas/cod.schema';

@ApiTags('COD')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CodController {
  constructor(
    private readonly cod: CodService,
    private readonly orders: OrderService,
    private readonly policy: CodPolicy,
  ) {}

  @Post('checkouts/:id/orders/cod')
  @HttpCode(200)
  @Serialize(orderListSchema)
  place(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: placeCodSchema }) input: PlaceCodInput,
  ) {
    return this.cod.place(user.id, id, input.expectedTotal);
  }

  @Post('orders/:id/cod/cancel')
  @HttpCode(200)
  @Serialize(orderSchema)
  cancel(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: cancelCodSchema }) _input: CancelCodInput,
  ) {
    return this.orders.cancelCodPending(user.id, id);
  }

  @Get('cod/restrictions/mine')
  @Serialize(codRestrictionsSchema)
  mine(@CurrentUser() user: User) {
    return this.policy.mine(user.id);
  }

  @Post('admin/cod/restrictions/:id/resolve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  resolve(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: rejectOrderSchema }) input: { reason: string },
  ) {
    return this.policy.resolve(user.id, id, input.reason);
  }
}
