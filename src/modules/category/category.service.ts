import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Not, Repository } from 'typeorm';

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
    await this.assertSlugAvailable(slug);

    return this.categoryRepository.save(
      this.categoryRepository.create({
        name,
        slug,
        isActive: input.isActive ?? true,
        requiredMeasurements: input.requiredMeasurements ?? [],
      }),
    );
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const category = await this.categoryRepository.findOneByOrFail({ id });

    if (input.slug !== undefined && input.slug !== category.slug) {
      await this.assertSlugAvailable(input.slug, id);
    }

    this.categoryRepository.merge(category, input);

    return this.categoryRepository.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoryRepository.findOneByOrFail({ id });
    if (!category.isActive) return;
    category.isActive = false;
    await this.categoryRepository.save(category);
  }

  private async assertSlugAvailable(
    slug: string,
    excludedId?: string,
  ): Promise<void> {
    const where = excludedId ? { slug, id: Not(excludedId) } : { slug };
    if (await this.categoryRepository.findOneBy(where)) {
      throw new ConflictException('Category slug already exists');
    }
  }
}
