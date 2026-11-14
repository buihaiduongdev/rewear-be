import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  ApiPaginationQuery,
  Paginate,
  type Paginated,
  type PaginateQuery,
} from 'nestjs-paginate';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { Product } from './entities';
import { PRODUCT_PAGINATION_CONFIG } from './pagination.config';
import { ProductService } from './product.service';
import {
  moderateProductSchema,
  productListSchema,
  productRevisionListSchema,
  productSchema,
  suspendProductSchema,
} from './schemas';
import {
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
} from './schemas/product-input.schema';
import type {
  CreateProductInput,
  ModerateProductInput,
  SuspendProductInput,
  UpdateProductInput,
  UpdateProductStatusInput,
} from './schemas/product-input.schema';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @Serialize(productListSchema)
  @ApiPaginationQuery(PRODUCT_PAGINATION_CONFIG)
  findAll(@Paginate() query: PaginateQuery): Promise<Paginated<Product>> {
    return this.productService.findAll(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productListSchema)
  @ApiPaginationQuery(PRODUCT_PAGINATION_CONFIG)
  findMine(
    @CurrentUser() currentUser: User,
    @Paginate() query: PaginateQuery,
  ): Promise<Paginated<Product>> {
    return this.productService.findMine(currentUser.id, query);
  }

  @Get('manage/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema)
  findManaged(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.productService.findOneForManagement(id, user.id);
  }

  @Get('manage/:id/revisions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productRevisionListSchema)
  revisions(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.productService.findRevisions(id, user.id);
  }

  @Get('admin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Serialize(productListSchema)
  @ApiPaginationQuery(PRODUCT_PAGINATION_CONFIG)
  reviewQueue(@CurrentUser() user: User, @Paginate() query: PaginateQuery) {
    return this.productService.findReviewQueue(query, user.id);
  }

  @Get('admin/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Serialize(productSchema)
  reviewDetail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.productService.findForReview(id, user.id);
  }

  @Get('admin/:id/revisions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Serialize(productRevisionListSchema)
  reviewHistory(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.productService.findRevisions(id, user.id, true);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema)
  submit(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.productService.submit(id, user.id);
  }

  @Post(':id/cancel-submission')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema)
  cancelSubmission(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.productService.cancelSubmission(id, user.id);
  }

  @Post('admin/:id/moderation')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Serialize(productSchema)
  moderate(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: moderateProductSchema }) input: ModerateProductInput,
  ) {
    return this.productService.moderate(id, user.id, input);
  }

  @Post('admin/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Serialize(productSchema)
  suspend(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: suspendProductSchema }) input: SuspendProductInput,
  ) {
    return this.productService.suspend(id, user.id, input.reason);
  }

  @Get(':id')
  @Serialize(productSchema)
  findOne(@Param('id', { schema: uuidSchema }) id: string): Promise<Product> {
    return this.productService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema, { status: HttpStatus.CREATED })
  create(
    @CurrentUser() currentUser: User,
    @Body({ schema: createProductSchema }) input: CreateProductInput,
  ): Promise<Product> {
    return this.productService.create(currentUser.id, input);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema)
  updateStatus(
    @CurrentUser() currentUser: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateProductStatusSchema })
    input: UpdateProductStatusInput,
  ): Promise<Product> {
    return this.productService.updateStatus(id, currentUser.id, input);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema)
  update(
    @CurrentUser() currentUser: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateProductSchema }) input: UpdateProductInput,
  ): Promise<Product> {
    return this.productService.update(id, currentUser.id, input);
  }
}
