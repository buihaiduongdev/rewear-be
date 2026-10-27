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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { IPaginatedResult } from '@/common/pagination';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { Product } from './entities';
import { ProductService } from './product.service';
import {
  findMyProductSchema,
  findProductSchema,
  moderateProductSchema,
  productListSchema,
  productRevisionListSchema,
  productSchema,
  suspendProductSchema,
} from './schemas';
import type { FindMyProductQuery, FindProductQuery } from './schemas';
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
  findAll(
    @Query({ schema: findProductSchema }) query: FindProductQuery,
  ): Promise<IPaginatedResult<Product>> {
    return this.productService.findAll(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productListSchema)
  findMine(
    @CurrentUser() currentUser: User,
    @Query({ schema: findMyProductSchema })
    query: FindMyProductQuery,
  ): Promise<IPaginatedResult<Product>> {
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
  reviewQueue(
    @CurrentUser() user: User,
    @Query({ schema: findMyProductSchema }) query: FindMyProductQuery,
  ) {
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
