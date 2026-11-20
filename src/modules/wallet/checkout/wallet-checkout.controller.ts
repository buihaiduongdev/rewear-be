import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import {
  reserveWalletCheckoutSchema,
  walletCheckoutViewSchema,
} from './schemas/wallet-checkout.schema';
import type { ReserveWalletCheckoutInput } from './schemas/wallet-checkout.schema';
import { WalletCheckoutService } from './wallet-checkout.service';

@ApiTags('Wallet checkout')
@ApiBearerAuth()
@Controller()
export class WalletCheckoutController {
  constructor(private readonly service: WalletCheckoutService) {}
  @AuthenticatedAccess()
  @Serialize(walletCheckoutViewSchema)
  @Post('checkouts/:id/payments/wallet')
  @HttpCode(200)
  reserve(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: reserveWalletCheckoutSchema })
    input: ReserveWalletCheckoutInput,
  ) {
    return this.service.reserve(user.id, id, input);
  }
  @AuthenticatedAccess()
  @Serialize(walletCheckoutViewSchema)
  @Get('wallet/checkouts/:id')
  find(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.findMine(user.id, id);
  }
  @AuthenticatedAccess()
  @Serialize(walletCheckoutViewSchema)
  @Post('wallet/checkouts/:id/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.confirm(user.id, id);
  }
  @AuthenticatedAccess()
  @Serialize(walletCheckoutViewSchema)
  @Post('wallet/checkouts/:id/release')
  @HttpCode(200)
  release(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.release(user.id, id);
  }
}
