import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOneBy({
      id,
      isActive: true,
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const name = input.name.trim();
    const slug = this.normalizeSlug(input.slug ?? name);
    await this.assertSlugAvailable(slug);

    return this.categoryRepository.save(
      this.categoryRepository.create({
        name,
        slug,
        isActive: input.isActive ?? true,
      }),
    );
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const category = await this.findById(id);

    if (input.name !== undefined) category.name = input.name.trim();
    if (input.slug !== undefined) {
      const slug = this.normalizeSlug(input.slug);
      if (slug !== category.slug) {
        await this.assertSlugAvailable(slug, id);
        category.slug = slug;
      }
    }
    if (input.isActive !== undefined) category.isActive = input.isActive;

    return this.categoryRepository.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findById(id);
    if (!category.isActive) return;
    category.isActive = false;
    await this.categoryRepository.save(category);
  }

  private async findById(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    return category;
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

  private normalizeSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) throw new BadRequestException('Category slug is invalid');
    if (slug.length > 120) {
      throw new BadRequestException(
        'Category slug must not exceed 120 characters',
      );
    }
    return slug;
  }
}
