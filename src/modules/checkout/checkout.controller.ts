import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { CheckoutService } from './checkout.service';
import {
  checkoutSchema,
  createCheckoutSchema,
} from './schemas/checkout.schema';
import {
  refreshShippingQuoteSchema,
  shippingQuoteSchema,
} from './schemas/shipping-quote.schema';
import { ShippingQuoteService } from './shipping-quote.service';
import type { CreateCheckoutInput } from './types/checkout.type';

@ApiTags('Checkout')
@ApiBearerAuth()
@Controller('checkouts')
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly shippingQuoteService: ShippingQuoteService,
  ) {}
  @AuthenticatedAccess()
  @Post(':id/shipping-quotes')
  @HttpCode(200)
  @Serialize(shippingQuoteSchema)
  quote(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: refreshShippingQuoteSchema }) _body: Record<string, never>,
  ) {
    return this.shippingQuoteService.refresh(user.id, id);
  }
  @AuthenticatedAccess()
  @Post()
  @HttpCode(200)
  @Serialize(checkoutSchema)
  create(
    @CurrentUser() user: User,
    @Body({ schema: createCheckoutSchema }) input: CreateCheckoutInput,
  ) {
    return this.checkoutService.create(user.id, input);
  }
  @AuthenticatedAccess()
  @Get(':id')
  @Serialize(checkoutSchema)
  find(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.checkoutService.findMine(user.id, id);
  }
  @AuthenticatedAccess()
  @Post(':id/cancel')
  @HttpCode(200)
  @Serialize(checkoutSchema)
  cancel(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.checkoutService.cancel(user.id, id);
  }
}
