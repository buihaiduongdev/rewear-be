import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { mediaUploadTicketSchema } from '@/modules/media/schemas';

import { shopSchema } from './schemas';
import { ShopLogoService } from './shop-logo.service';

const logoInputSchema = z.strictObject({
  mimeType: z.string().min(1).max(100),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
const confirmLogoSchema = logoInputSchema.extend({
  storageKey: z.string().min(1).max(512),
});

@ApiTags('Shop logo')
@ApiBearerAuth()
@Controller('shops/:shopId/logo')
export class ShopLogoController {
  constructor(private readonly logos: ShopLogoService) {}

  @Post('upload-ticket')
  @RequirePermission(SHOP_PERMISSIONS.SHOP_UPDATE)
  @Serialize(mediaUploadTicketSchema, { status: HttpStatus.CREATED })
  ticket(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: logoInputSchema }) input: z.output<typeof logoInputSchema>,
  ) {
    return this.logos.ticket(shopId, input);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(SHOP_PERMISSIONS.SHOP_UPDATE)
  @Serialize(shopSchema)
  confirm(
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: confirmLogoSchema })
    input: z.output<typeof confirmLogoSchema>,
  ) {
    return this.logos.confirm(shopId, input);
  }
}
