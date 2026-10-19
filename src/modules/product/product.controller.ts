import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { IPaginatedResult } from '@/common/pagination';
import { ZodValidationPipe } from '@/common/pipes';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import {
  CreateProductDto,
  UpdateProductDto,
  UpdateProductStatusDto,
} from './dto';
import { Product } from './entities';
import { ProductService } from './product.service';
import {
  findMyProductSchema,
  findProductSchema,
  productListSchema,
  productSchema,
} from './schemas';
import type { FindMyProductQuery, FindProductQuery } from './schemas';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @Serialize(productListSchema)
  findAll(
    @Query(new ZodValidationPipe(findProductSchema)) query: FindProductQuery,
  ): Promise<IPaginatedResult<Product>> {
    return this.productService.findAll(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productListSchema)
  findMine(
    @CurrentUser() currentUser: User,
    @Query(new ZodValidationPipe(findMyProductSchema))
    query: FindMyProductQuery,
  ): Promise<IPaginatedResult<Product>> {
    return this.productService.findMine(currentUser.id, query);
  }

  @Get(':id')
  @Serialize(productSchema)
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.productService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema, { status: HttpStatus.CREATED })
  create(
    @CurrentUser() currentUser: User,
    @Body() input: CreateProductDto,
  ): Promise<Product> {
    return this.productService.create(currentUser.id, input);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema)
  updateStatus(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProductStatusDto,
  ): Promise<Product> {
    return this.productService.updateStatus(id, currentUser.id, input);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(productSchema)
  update(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProductDto,
  ): Promise<Product> {
    return this.productService.update(id, currentUser.id, input);
  }
}
