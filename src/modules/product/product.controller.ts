import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { IPaginatedResult } from '@/common/pagination';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { Product } from './entities';
import { ProductService } from './product.service';
import {
  findMyProductSchema,
  findProductSchema,
  productListSchema,
  productSchema,
} from './schemas';
import type { FindMyProductQuery, FindProductQuery } from './schemas';
import {
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
} from './schemas/product-input.schema';
import type {
  CreateProductInput,
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
