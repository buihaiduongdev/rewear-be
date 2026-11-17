import { Body, Controller, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { shippingPackageSchema } from '@/common/schemas/shipping-package.schema';
import type { ShippingPackage } from '@/common/schemas/shipping-package.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { ProductService } from '@/modules/product/product.service';
import { productSchema } from '@/modules/product/schemas';
import { User } from '@/modules/user/entities';

@ApiTags('Shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly productService: ProductService) {}

  @Patch('products/:productId/package')
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Serialize(productSchema)
  updatePackage(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) id: string,
    @Body({ schema: shippingPackageSchema }) input: ShippingPackage,
  ) {
    return this.productService.update(id, user.id, { shippingPackage: input });
  }
}
