import { ConflictException, NotFoundException } from '@nestjs/common';

import type { Repository } from 'typeorm';

import { CategoryService } from '@/modules/category/category.service';
import { Category } from '@/modules/category/entities';

describe('CategoryService', () => {
  const category: Category = {
    id: '50fb07e8-f8d8-49a8-a80f-e1a1ba3937be',
    name: 'Áo khoác',
    slug: 'ao-khoac',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const repository: jest.Mocked<
    Pick<Repository<Category>, 'find' | 'findOneBy' | 'create' | 'save'>
  > = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const service = new CategoryService(
    repository as unknown as Repository<Category>,
  );

  beforeEach(() => {
    jest.resetAllMocks();
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

    await expect(service.create({ name: '  Áo khoác  ' })).resolves.toBe(
      created,
    );
    expect(repository.findOneBy).toHaveBeenCalledWith({ slug: 'ao-khoac' });
    expect(repository.create).toHaveBeenCalledWith({
      name: 'Áo khoác',
      slug: 'ao-khoac',
      isActive: true,
    });
  });

  it('rejects a duplicate slug', async () => {
    repository.findOneBy.mockResolvedValueOnce(category);

    await expect(service.create({ name: 'Áo khoác' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('does not expose an inactive category through the public lookup', async () => {
    repository.findOneBy.mockResolvedValueOnce(null);

    await expect(service.findOne(category.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: category.id,
      isActive: true,
    });
  });

  it('updates the name without changing the stable slug', async () => {
    const existing = { ...category };
    const updated = { ...existing, name: 'Áo mùa đông' };
    repository.findOneBy.mockResolvedValueOnce(existing);
    repository.save.mockResolvedValueOnce(updated);

    await expect(
      service.update(category.id, { name: '  Áo mùa đông  ' }),
    ).resolves.toEqual(updated);
    expect(repository.save).toHaveBeenCalledWith({
      ...existing,
      name: 'Áo mùa đông',
      slug: 'ao-khoac',
    });
  });

  it('soft deletes a category by marking it inactive', async () => {
    const existing = { ...category };
    repository.findOneBy.mockResolvedValueOnce(existing);
    repository.save.mockResolvedValueOnce({ ...existing, isActive: false });

    await expect(service.remove(category.id)).resolves.toBeUndefined();
    expect(repository.save).toHaveBeenCalledWith({
      ...existing,
      isActive: false,
    });
  });
});
