import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { trimmedTextSchema, uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { PickupLocationService } from './pickup-location.service';
import { pickupLocationResultSchema } from './schemas/pickup-location.schema';

const resolveSchema = z.strictObject({
  ghnShopId: z.number().int().positive(),
  reason: trimmedTextSchema.min(1).max(1000),
});

@ApiTags('GHN connection recovery')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/shipping/shops')
export class GhnConnectionAdminController {
  constructor(private readonly locations: PickupLocationService) {}

  @AuthenticatedAccess()
  @Post(':shopId/ghn/resolve')
  @HttpCode(200)
  @Serialize(pickupLocationResultSchema)
  resolve(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: resolveSchema }) input: z.output<typeof resolveSchema>,
  ) {
    return this.locations.resolveGhn(
      shopId,
      user.id,
      input.ghnShopId,
      input.reason,
    );
  }
}
