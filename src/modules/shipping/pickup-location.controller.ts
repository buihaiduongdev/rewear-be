import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { User } from '@/modules/user/entities';

import { PickupLocationService } from './pickup-location.service';
import {
  connectGhnShopSchema,
  pickupLocationResultSchema,
  savePickupLocationSchema,
} from './schemas/pickup-location.schema';
import type {
  ConnectGhnShopInput,
  SavePickupLocationInput,
} from './schemas/pickup-location.schema';

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

  @Get('shops/:shopId/pickup-location/ghn/shop')
  @RequirePermission(SHOP_PERMISSIONS.PICKUP_VIEW)
  @Serialize(
    z.object({
      shopId: z.number(),
      name: z.string(),
      phone: z.string(),
      address: z.string(),
      districtId: z.number(),
      wardCode: z.string(),
      active: z.boolean(),
    }),
  )
  ghnShop(@Param('shopId', { schema: uuidSchema }) shopId: string) {
    return this.pickupLocationService.readGhnShop(shopId);
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
  @Get('shops/:shopId/pickup-location/ghn/provinces')
  @RequirePermission(SHOP_PERMISSIONS.PICKUP_UPDATE)
  @Serialize(z.array(z.object({ id: z.number(), name: z.string() })))
  provinces(@Param('shopId', { schema: uuidSchema }) _shopId: string) {
    return this.pickupLocationService.ghnProvinces();
  }

  @Get('shops/:shopId/pickup-location/ghn/districts')
  @RequirePermission(SHOP_PERMISSIONS.PICKUP_UPDATE)
  @Serialize(z.array(z.object({ id: z.number(), name: z.string() })))
  districts(
    @Param('shopId', { schema: uuidSchema }) _shopId: string,
    @Query({
      schema: z.strictObject({
        provinceId: z.coerce.number().int().positive(),
      }),
    })
    input: { provinceId: number },
  ) {
    return this.pickupLocationService.ghnDistricts(input.provinceId);
  }

  @Get('shops/:shopId/pickup-location/ghn/wards')
  @RequirePermission(SHOP_PERMISSIONS.PICKUP_UPDATE)
  @Serialize(z.array(z.object({ id: z.string(), name: z.string() })))
  wards(
    @Param('shopId', { schema: uuidSchema }) _shopId: string,
    @Query({
      schema: z.strictObject({
        districtId: z.coerce.number().int().positive(),
      }),
    })
    input: { districtId: number },
  ) {
    return this.pickupLocationService.ghnWards(input.districtId);
  }

  @Post('shops/:shopId/pickup-location/ghn')
  @HttpCode(200)
  @RequirePermission(SHOP_PERMISSIONS.PICKUP_UPDATE)
  @Serialize(pickupLocationResultSchema)
  connect(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: connectGhnShopSchema }) input: ConnectGhnShopInput,
  ) {
    return this.pickupLocationService.connectGhn(shopId, input);
  }

  @Post('shops/:shopId/pickup-location/ghn/disconnect')
  @HttpCode(200)
  @RequirePermission(SHOP_PERMISSIONS.PICKUP_UPDATE)
  @Serialize(pickupLocationResultSchema)
  disconnect(@Param('shopId', { schema: uuidSchema }) shopId: string) {
    return this.pickupLocationService.disconnectGhn(shopId);
  }
}
