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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
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

  @PublicAccess()
  @Get()
  @Serialize(categoryListSchema)
  findAll(): Promise<Category[]> {
    return this.categoryService.findAll();
  }

  @PublicAccess()
  @Get(':id')
  @Serialize(categorySchema)
  findOne(@Param('id', { schema: uuidSchema }) id: string): Promise<Category> {
    return this.categoryService.findOne(id);
  }

  @AuthenticatedAccess()
  @Post()
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Serialize(categorySchema, { status: HttpStatus.CREATED })
  create(
    @Body({ schema: createCategorySchema }) input: CreateCategoryInput,
  ): Promise<Category> {
    return this.categoryService.create(input);
  }

  @AuthenticatedAccess()
  @Patch(':id')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Serialize(categorySchema)
  update(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCategorySchema }) input: UpdateCategoryInput,
  ): Promise<Category> {
    return this.categoryService.update(id, input);
  }

  @AuthenticatedAccess()
  @Delete(':id')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidSchema }) id: string): Promise<void> {
    return this.categoryService.remove(id);
  }
}
