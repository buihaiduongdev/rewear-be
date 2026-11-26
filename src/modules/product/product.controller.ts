import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  ApiPaginationQuery,
  Paginate,
  type Paginated,
  type PaginateQuery,
} from 'nestjs-paginate';

import {
  CurrentShopId,
  CurrentUser,
  Roles,
  Serialize,
} from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { Product } from './entities';
import { GeminiService } from './gemini.service';
import { PRODUCT_PAGINATION_CONFIG } from './pagination.config';
import { ProductService } from './product.service';
import {
  moderateProductSchema,
  productListSchema,
  productModerationSchema,
  productSchema,
  suggestDescriptionResponseSchema,
  suspendProductSchema,
} from './schemas';
import {
  createProductSchema,
  optionalProvinceIdSchema,
  suggestDescriptionSchema,
  updateProductSchema,
  updateProductStatusSchema,
} from './schemas/product-input.schema';
import type {
  CreateProductInput,
  ModerateProductInput,
  SuggestDescriptionInput,
  SuspendProductInput,
  UpdateProductInput,
  UpdateProductStatusInput,
} from './schemas/product-input.schema';
import type { SuggestDescriptionResponse } from './schemas/product.schema';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly geminiService: GeminiService,
  ) {}

  @Get()
  @PublicAccess()
  @Serialize(productListSchema)
  @ApiPaginationQuery(PRODUCT_PAGINATION_CONFIG)
  findAll(
    @Paginate() query: PaginateQuery,
    @Query('provinceId', { schema: optionalProvinceIdSchema })
    provinceId?: number,
  ): Promise<Paginated<Product>> {
    return this.productService.findAll(query, provinceId);
  }

  @Post('suggest-description')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_CREATE)
  @Serialize(suggestDescriptionResponseSchema)
  suggestDescription(
    @Body({ schema: suggestDescriptionSchema })
    input: SuggestDescriptionInput,
  ): Promise<SuggestDescriptionResponse> {
    return this.geminiService.suggestProductDescription(input);
  }

  @Get('me')
  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Serialize(productListSchema)
  @ApiPaginationQuery(PRODUCT_PAGINATION_CONFIG)
  findMine(
    @CurrentUser() currentUser: User,
    @Paginate() query: PaginateQuery,
  ): Promise<Paginated<Product>> {
    return this.productService.findMine(currentUser.id, query);
  }

  @Get('manage/:productId')
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_VIEW)
  @Serialize(productSchema)
  findManaged(
    @Param('productId', { schema: uuidSchema }) id: string,
    @CurrentShopId() shopId?: string,
  ) {
    return this.productService.findManagedProduct(id, shopId);
  }

  @Get('manage/:productId/moderation')
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_VIEW)
  @Serialize(productModerationSchema)
  moderationForOwner(
    @Param('productId', { schema: uuidSchema }) id: string,
    @CurrentShopId() shopId?: string,
  ) {
    return this.productService.findModeration(id, shopId);
  }

  @Get('admin')
  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Roles(UserRole.ADMIN)
  @Serialize(productListSchema)
  @ApiPaginationQuery(PRODUCT_PAGINATION_CONFIG)
  reviewQueue(@Paginate() query: PaginateQuery) {
    return this.productService.findReviewQueue(query);
  }

  @Get('admin/:productId')
  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Roles(UserRole.ADMIN)
  @Serialize(productSchema)
  reviewDetail(@Param('productId', { schema: uuidSchema }) id: string) {
    return this.productService.findForReview(id);
  }

  @Get('admin/:productId/moderation')
  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Roles(UserRole.ADMIN)
  @Serialize(productModerationSchema)
  moderationForAdmin(@Param('productId', { schema: uuidSchema }) id: string) {
    return this.productService.findModeration(id);
  }

  @Post(':productId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Serialize(productSchema)
  submit(
    @Param('productId', { schema: uuidSchema }) id: string,
    @CurrentShopId() shopId?: string,
  ) {
    return this.productService.submit(id, shopId);
  }

  @Post(':productId/cancel-submission')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Serialize(productSchema)
  cancelSubmission(
    @Param('productId', { schema: uuidSchema }) id: string,
    @CurrentShopId() shopId?: string,
  ) {
    return this.productService.cancelSubmission(id, shopId);
  }

  @Post('admin/:productId/moderation')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Roles(UserRole.ADMIN)
  @Serialize(productSchema)
  moderate(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) id: string,
    @Body({ schema: moderateProductSchema }) input: ModerateProductInput,
  ) {
    return this.productService.moderate(id, user.id, input);
  }

  @Post('admin/:productId/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @AuthenticatedAccess()
  @Roles(UserRole.ADMIN)
  @Serialize(productSchema)
  suspend(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) id: string,
    @Body({ schema: suspendProductSchema }) input: SuspendProductInput,
  ) {
    return this.productService.suspend(id, user.id, input);
  }

  @Get(':productId')
  @PublicAccess()
  @Serialize(productSchema)
  findOne(
    @Param('productId', { schema: uuidSchema }) id: string,
  ): Promise<Product> {
    return this.productService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_CREATE)
  @Serialize(productSchema, { status: HttpStatus.CREATED })
  create(
    @CurrentUser() currentUser: User,
    @Body({ schema: createProductSchema }) input: CreateProductInput,
  ): Promise<Product> {
    return this.productService.create(currentUser.id, input);
  }

  @Patch(':productId/status')
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Serialize(productSchema)
  updateStatus(
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) id: string,
    @Body({ schema: updateProductStatusSchema })
    input: UpdateProductStatusInput,
    @CurrentShopId() shopId?: string,
  ): Promise<Product> {
    return this.productService.updateStatus(id, currentUser.id, input, shopId);
  }

  @Patch(':productId')
  @ApiBearerAuth()
  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Serialize(productSchema)
  update(
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) id: string,
    @Body({ schema: updateProductSchema }) input: UpdateProductInput,
    @CurrentShopId() shopId?: string,
  ): Promise<Product> {
    return this.productService.update(id, currentUser.id, input, shopId);
  }
}
