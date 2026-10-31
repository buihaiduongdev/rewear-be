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

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { CheckoutService } from './checkout.service';
import {
  checkoutSchema,
  createCheckoutSchema,
} from './schemas/checkout.schema';
import type { CreateCheckoutInput } from './schemas/checkout.schema';
import {
  refreshShippingQuoteSchema,
  shippingQuoteSchema,
} from './schemas/shipping-quote.schema';
import { ShippingQuoteService } from './shipping-quote.service';

@ApiTags('Checkout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('checkouts')
export class CheckoutController {
  constructor(
    private readonly service: CheckoutService,
    private readonly shipping: ShippingQuoteService,
  ) {}
  @Post(':id/shipping-quotes')
  @HttpCode(200)
  @Serialize(shippingQuoteSchema)
  quote(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: refreshShippingQuoteSchema }) _body: Record<string, never>,
  ) {
    return this.shipping.refresh(user.id, id);
  }
  @Post()
  @HttpCode(200)
  @Serialize(checkoutSchema)
  create(
    @CurrentUser() user: User,
    @Body({ schema: createCheckoutSchema }) input: CreateCheckoutInput,
  ) {
    return this.service.create(user.id, input);
  }
  @Get(':id')
  @Serialize(checkoutSchema)
  find(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.findMine(user.id, id);
  }
  @Post(':id/cancel')
  @HttpCode(200)
  @Serialize(checkoutSchema)
  cancel(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.cancel(user.id, id);
  }
}
