import { ConflictException } from '@nestjs/common';

import type { DataSource, Repository } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { ProductService } from '@/modules/product/product.service';
import {
  createProductSchema,
  moderateProductSchema,
  updateProductStatusSchema,
} from '@/modules/product/schemas';
import { Shop, ShopMember } from '@/modules/shop/entities';

describe('Product lifecycle boundaries', () => {
  const service = new ProductService(
    {} as Repository<Product>,
    {} as Repository<Category>,
    {} as Repository<Shop>,
    {} as Repository<ShopMember>,
    {} as DataSource,
  );

  it.each([ProductStatus.HELD, ProductStatus.SOLD, ProductStatus.SUSPENDED])(
    'blocks edits while %s',
    (status) => {
      expect(() =>
        service.assertEditable(Object.assign(new Product(), { status })),
      ).toThrow(ConflictException);
    },
  );

  it('allows an incomplete draft but forbids seller-controlled lifecycle fields', () => {
    expect(createProductSchema.parse({})).toEqual({});
    expect(createProductSchema.safeParse({ revision: 10 }).success).toBe(false);
    expect(
      updateProductStatusSchema.safeParse({ status: 'SOLD' }).success,
    ).toBe(false);
    expect(
      updateProductStatusSchema.safeParse({ status: 'HELD' }).success,
    ).toBe(false);
  });

  it('requires a current revision and a nonblank rejection reason', () => {
    expect(
      moderateProductSchema.safeParse({ revision: 1, decision: 'REJECT' })
        .success,
    ).toBe(false);
    expect(
      moderateProductSchema.safeParse({
        revision: 1,
        decision: 'REJECT',
        reason: '   ',
      }).success,
    ).toBe(false);
    expect(
      moderateProductSchema.parse({
        revision: 1,
        decision: 'REJECT',
        reason: ' Thiếu ảnh ',
      }).reason,
    ).toBe('Thiếu ảnh');
  });
});
