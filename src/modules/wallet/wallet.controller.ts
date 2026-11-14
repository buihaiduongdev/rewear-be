import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { walletQuerySchema, walletViewSchema } from './schemas/wallet.schema';
import type { WalletQueryInput } from './schemas/wallet.schema';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get('mine')
  @Serialize(walletViewSchema)
  mine(
    @CurrentUser() user: User,
    @Query({ schema: walletQuerySchema })
    input: WalletQueryInput,
  ) {
    return this.wallet.mine(user.id, input);
  }
}
