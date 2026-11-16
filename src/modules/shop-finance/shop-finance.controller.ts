import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { financeListSchema } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { FinanceListInput } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { User } from '@/modules/user/entities';

import { shopFinanceViewSchema } from './schemas/shop-finance.schema';
import { ShopFinanceService } from './shop-finance.service';

@ApiTags('Shop finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shops/:shopId/finance')
export class ShopFinanceController {
  constructor(private readonly finance: ShopFinanceService) {}
  @Get()
  @Serialize(shopFinanceViewSchema)
  view(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Query({ schema: financeListSchema }) input: FinanceListInput,
  ) {
    return this.finance.view(user.id, shopId, input);
  }
}
