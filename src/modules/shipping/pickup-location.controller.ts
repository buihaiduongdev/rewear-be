import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { PickupLocationService } from './pickup-location.service';
import {
  pickupLocationResultSchema,
  savePickupLocationSchema,
} from './schemas/pickup-location.schema';
import type { SavePickupLocationInput } from './schemas/pickup-location.schema';

@ApiTags('PickupLocations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shipping')
export class PickupLocationController {
  constructor(private readonly pickup: PickupLocationService) {}

  @Get('pickup-location')
  @Serialize(pickupLocationResultSchema)
  findPersonal(@CurrentUser() user: User) {
    return this.pickup.read(user.id);
  }

  @Put('pickup-location')
  @Serialize(pickupLocationResultSchema)
  savePersonal(
    @CurrentUser() user: User,
    @Body({ schema: savePickupLocationSchema }) input: SavePickupLocationInput,
  ) {
    return this.pickup.save(user.id, input);
  }

  @Get('shops/:shopId/pickup-location')
  @Serialize(pickupLocationResultSchema)
  findShop(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.pickup.read(user.id, shopId);
  }

  @Put('shops/:shopId/pickup-location')
  @Serialize(pickupLocationResultSchema)
  saveShop(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: savePickupLocationSchema }) input: SavePickupLocationInput,
  ) {
    return this.pickup.save(user.id, input, shopId);
  }
}
