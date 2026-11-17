import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { handleDatabaseConstraint } from '@/common/utils/database-constraint.util';

import { Category } from './entities';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from './schemas/category-input.schema';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categoryRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: string): Promise<Category> {
    return this.categoryRepository.findOneByOrFail({
      id,
      isActive: true,
    });
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const { name, slug } = input;

    try {
      return await this.categoryRepository.save(
        this.categoryRepository.create({
          name,
          slug,
          isActive: input.isActive ?? true,
          requiredMeasurements: input.requiredMeasurements ?? [],
        }),
      );
    } catch (error) {
      handleDatabaseConstraint(error, {
        UQ_categories_slug: 'Category slug already exists',
      });
    }
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const category = await this.categoryRepository.findOneByOrFail({ id });

    this.categoryRepository.merge(category, input);

    try {
      return await this.categoryRepository.save(category);
    } catch (error) {
      handleDatabaseConstraint(error, {
        UQ_categories_slug: 'Category slug already exists',
      });
    }
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoryRepository.findOneByOrFail({ id });
    if (!category.isActive) return;
    category.isActive = false;
    await this.categoryRepository.save(category);
  }
}
