import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';
import { UserRole } from '@/modules/user/enums';

import { CategoryService } from './category.service';
import { Category } from './entities';
import { categoryListSchema, categorySchema } from './schemas';
import {
  createCategorySchema,
  updateCategorySchema,
} from './schemas/category-input.schema';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from './schemas/category-input.schema';

@ApiTags('Categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @Serialize(categoryListSchema)
  findAll(): Promise<Category[]> {
    return this.categoryService.findAll();
  }

  @Get(':id')
  @Serialize(categorySchema)
  findOne(@Param('id', { schema: uuidSchema }) id: string): Promise<Category> {
    return this.categoryService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Serialize(categorySchema, { status: HttpStatus.CREATED })
  create(
    @Body({ schema: createCategorySchema }) input: CreateCategoryInput,
  ): Promise<Category> {
    return this.categoryService.create(input);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Serialize(categorySchema)
  update(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCategorySchema }) input: UpdateCategoryInput,
  ): Promise<Category> {
    return this.categoryService.update(id, input);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidSchema }) id: string): Promise<void> {
    return this.categoryService.remove(id);
  }
}
