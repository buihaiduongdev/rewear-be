import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import {
  MAX_PACKAGE_DIMENSION_CM,
  MAX_PACKAGE_WEIGHT_GRAMS,
  shippingPackageOptionsSchema,
  SIZE_PRESETS,
  WEIGHT_PRESETS,
} from '@/common/schemas/shipping-package.schema';
import { shippingPackageSchema } from '@/common/schemas/shipping-package.schema';
import type { ShippingPackage } from '@/common/schemas/shipping-package.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { ProductService } from '@/modules/product/product.service';
import { productSchema } from '@/modules/product/schemas';
import { User } from '@/modules/user/entities';

@ApiTags('Shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly products: ProductService) {}

  @Patch('products/:id/package')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema)
  updatePackage(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: shippingPackageSchema }) input: ShippingPackage,
  ) {
    return this.products.update(id, user.id, { shippingPackage: input });
  }

  @Get('package-options')
  @Serialize(shippingPackageOptionsSchema)
  packageOptions() {
    return {
      weightPresets: Object.entries(WEIGHT_PRESETS).map(([id, preset]) => ({
        id,
        ...preset,
      })),
      sizePresets: Object.entries(SIZE_PRESETS).map(([id, preset]) => ({
        id,
        ...preset,
      })),
      customLimits: {
        maxWeightGrams: MAX_PACKAGE_WEIGHT_GRAMS,
        maxDimensionCm: MAX_PACKAGE_DIMENSION_CM,
      },
    };
  }
}
