import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { User } from '@/modules/user/entities';

import { PickupLocationService } from './pickup-location.service';
import {
  pickupLocationResultSchema,
  savePickupLocationSchema,
} from './schemas/pickup-location.schema';
import type { SavePickupLocationInput } from './schemas/pickup-location.schema';

@ApiTags('PickupLocations')
@ApiBearerAuth()
@Controller('shipping')
export class PickupLocationController {
  constructor(private readonly pickupLocationService: PickupLocationService) {}

  @Get('shops/:shopId/pickup-location')
  @RequirePermission(SHOP_PERMISSIONS.PICKUP_VIEW)
  @Serialize(pickupLocationResultSchema)
  findShop(@Param('shopId', { schema: uuidSchema }) shopId: string) {
    return this.pickupLocationService.read(shopId);
  }

  @Put('shops/:shopId/pickup-location')
  @RequirePermission(SHOP_PERMISSIONS.PICKUP_UPDATE)
  @Serialize(pickupLocationResultSchema)
  saveShop(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: savePickupLocationSchema }) input: SavePickupLocationInput,
  ) {
    return this.pickupLocationService.save(user.id, input, shopId);
  }
}
