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
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { WalletCheckoutService } from './checkout/wallet-checkout.service';
import {
  reserveWalletCheckoutSchema,
  walletCheckoutViewSchema,
  walletQuerySchema,
  walletViewSchema,
} from './schemas/wallet.schema';
import type {
  ReserveWalletCheckoutInput,
  WalletQueryInput,
} from './schemas/wallet.schema';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly checkoutService: WalletCheckoutService,
  ) {}

  @Get('wallet/mine')
  @Serialize(walletViewSchema)
  mine(
    @CurrentUser() user: User,
    @Query({ schema: walletQuerySchema }) input: WalletQueryInput,
  ) {
    return this.walletService.mine(user.id, input);
  }

  @Post('checkouts/:id/payments/wallet')
  @HttpCode(200)
  @Serialize(walletCheckoutViewSchema)
  reserve(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: reserveWalletCheckoutSchema })
    input: ReserveWalletCheckoutInput,
  ) {
    return this.checkoutService.reserve(user.id, id, input);
  }

  @Get('wallet/checkouts/:id')
  @Serialize(walletCheckoutViewSchema)
  find(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.checkoutService.findMine(user.id, id);
  }

  @Post('wallet/checkouts/:id/confirm')
  @HttpCode(200)
  @Serialize(walletCheckoutViewSchema)
  confirm(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.checkoutService.confirm(user.id, id);
  }

  @Post('wallet/checkouts/:id/release')
  @HttpCode(200)
  @Serialize(walletCheckoutViewSchema)
  release(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.checkoutService.release(user.id, id);
  }
}
