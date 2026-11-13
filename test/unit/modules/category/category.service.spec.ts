import { ConflictException } from '@nestjs/common';

import { EntityNotFoundError } from 'typeorm';
import type { Repository } from 'typeorm';

import { CategoryService } from '@/modules/category/category.service';
import { Category } from '@/modules/category/entities';
import {
  createCategorySchema,
  updateCategorySchema,
} from '@/modules/category/schemas/category-input.schema';

describe('CategoryService', () => {
  const category: Category = {
    id: '50fb07e8-f8d8-49a8-a80f-e1a1ba3937be',
    name: 'Áo khoác',
    slug: 'ao-khoac',
    isActive: true,
    requiredMeasurements: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const repository: jest.Mocked<
    Pick<
      Repository<Category>,
      'find' | 'findOneBy' | 'findOneByOrFail' | 'create' | 'save' | 'merge'
    >
  > = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
  };
  const service = new CategoryService(
    repository as unknown as Repository<Category>,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    repository.merge.mockImplementation((entity, ...sources) => {
      for (const source of sources) {
        Object.assign(
          entity,
          Object.fromEntries(
            Object.entries(source).filter(([, value]) => value !== undefined),
          ),
        );
      }
      return entity;
    });
  });

  it('lists active categories in name order', async () => {
    repository.find.mockResolvedValueOnce([category]);

    await expect(service.findAll()).resolves.toEqual([category]);
    expect(repository.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  });

  it('creates a category and generates a normalized Vietnamese slug', async () => {
    const created = { ...category };
    repository.findOneBy.mockResolvedValueOnce(null);
    repository.create.mockReturnValueOnce(created);
    repository.save.mockResolvedValueOnce(created);

    await expect(
      service.create(createCategorySchema.parse({ name: 'Áo khoác' })),
    ).resolves.toBe(created);
    expect(repository.findOneBy).toHaveBeenCalledWith({ slug: 'ao-khoac' });
    expect(repository.create).toHaveBeenCalledWith({
      name: 'Áo khoác',
      slug: 'ao-khoac',
      isActive: true,
      requiredMeasurements: [],
    });
  });

  it('rejects a duplicate slug', async () => {
    repository.findOneBy.mockResolvedValueOnce(category);

    await expect(
      service.create(createCategorySchema.parse({ name: 'Áo khoác' })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not expose an inactive category through the public lookup', async () => {
    repository.findOneByOrFail.mockRejectedValueOnce(
      new EntityNotFoundError(Category, { id: category.id }),
    );

    await expect(service.findOne(category.id)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    expect(repository.findOneByOrFail).toHaveBeenCalledWith({
      id: category.id,
      isActive: true,
    });
  });

  it('updates the slug when the name changes', async () => {
    const existing = { ...category };
    const updated = { ...existing, name: 'Áo mùa đông', slug: 'ao-mua-dong' };
    repository.findOneByOrFail.mockResolvedValueOnce(existing);
    repository.findOneBy.mockResolvedValueOnce(null);
    repository.save.mockResolvedValueOnce(updated);

    await expect(
      service.update(
        category.id,
        updateCategorySchema.parse({ name: 'Áo mùa đông' }),
      ),
    ).resolves.toEqual(updated);
    expect(repository.merge).toHaveBeenCalledWith(existing, {
      name: 'Áo mùa đông',
      slug: 'ao-mua-dong',
    });
    expect(repository.save).toHaveBeenCalledWith({
      ...existing,
      name: 'Áo mùa đông',
      slug: 'ao-mua-dong',
    });
  });

  it('rejects a generated slug that belongs to another category', async () => {
    const existing = { ...category };
    repository.findOneByOrFail.mockResolvedValueOnce(existing);
    repository.findOneBy.mockResolvedValueOnce({
      ...category,
      id: 'another-id',
      slug: 'ao-am',
    });

    await expect(
      service.update(
        category.id,
        updateCategorySchema.parse({ name: 'Áo Ấm' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('preserves omitted values while applying false and empty measurements', async () => {
    const existing = { ...category, requiredMeasurements: ['chest' as const] };
    repository.findOneByOrFail.mockResolvedValueOnce(existing);
    repository.save.mockImplementationOnce(
      async (entity) => entity as Category,
    );

    await expect(
      service.update(category.id, {
        name: undefined,
        isActive: false,
        requiredMeasurements: [],
      }),
    ).resolves.toMatchObject({
      name: category.name,
      slug: category.slug,
      isActive: false,
      requiredMeasurements: [],
    });
  });

  it('soft deletes a category by marking it inactive', async () => {
    const existing = { ...category };
    repository.findOneByOrFail.mockResolvedValueOnce(existing);
    repository.save.mockResolvedValueOnce({ ...existing, isActive: false });

    await expect(service.remove(category.id)).resolves.toBeUndefined();
    expect(repository.save).toHaveBeenCalledWith({
      ...existing,
      isActive: false,
    });
  });
});
