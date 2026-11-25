import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { CoinService } from './core/coin.service';
import {
  coinBalanceViewSchema,
  coinHistoryQuerySchema,
  coinHistoryViewSchema,
} from './core/schemas/coin.schema';
import type {
  CoinBalanceView,
  CoinHistoryQueryInput,
  CoinHistoryView,
} from './core/schemas/coin.schema';

@ApiTags('Coins')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('coins')
export class CoinController {
  constructor(private readonly coins: CoinService) {}

  @Get('balance')
  @Serialize(coinBalanceViewSchema)
  balance(@CurrentUser() user: User): Promise<CoinBalanceView> {
    return this.coins.balance(user.id);
  }

  @Get('history')
  @Serialize(coinHistoryViewSchema)
  history(
    @CurrentUser() user: User,
    @Query({ schema: coinHistoryQuerySchema }) query: CoinHistoryQueryInput,
  ): Promise<CoinHistoryView> {
    return this.coins.history(user.id, query);
  }
}
