import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { walletQuerySchema, walletViewSchema } from './schemas/wallet.schema';
import type { WalletQueryInput } from './schemas/wallet.schema';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}
  @AuthenticatedAccess()
  @Get('mine')
  @Serialize(walletViewSchema)
  mine(
    @CurrentUser() user: User,
    @Query({ schema: walletQuerySchema })
    input: WalletQueryInput,
  ) {
    return this.walletService.mine(user.id, input);
  }
}
