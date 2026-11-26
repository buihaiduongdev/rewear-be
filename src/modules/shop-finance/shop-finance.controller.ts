import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { financeListSchema } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { FinanceListInput } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { User } from '@/modules/user/entities';

import { shopFinanceViewSchema } from './schemas/shop-finance.schema';
import { ShopFinanceService } from './shop-finance.service';

@ApiTags('Shop finance')
@ApiBearerAuth()
@Controller('shops/:shopId/finance')
export class ShopFinanceController {
  constructor(private readonly shopFinanceService: ShopFinanceService) {}
  @RequirePermission(SHOP_PERMISSIONS.SHOP_OWNER)
  @Get()
  @Serialize(shopFinanceViewSchema)
  view(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Query({ schema: financeListSchema }) input: FinanceListInput,
  ) {
    return this.shopFinanceService.view(user.id, shopId, input);
  }
}
