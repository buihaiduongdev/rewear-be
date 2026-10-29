import z from 'zod';

import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { validateSeedOptions } from '@/modules/database/seeds/marketplace.seed';
import {
  validateSeedSchemaTarget,
  validateSeedTarget,
} from '@/modules/database/seeds/seed';
import { ProductCondition } from '@/modules/product/enums';

describe('Marketplace seed factories', () => {
  it('provides stable UUIDs within a namespace and isolates other namespaces', () => {
    const factory = new MarketplaceFactory('e2e');
    expect(z.uuid().parse(factory.id('product:0'))).toBe(
      new MarketplaceFactory('e2e').id('product:0'),
    );
    expect(factory.id('product:0')).not.toBe(
      new MarketplaceFactory('other').id('product:0'),
    );
    expect(factory.id('product:0')).not.toBe(factory.id('product:1'));
  });

  it('supports explicit overrides without modifying later factory output', () => {
    const factory = new MarketplaceFactory();
    const source = {
      categoryId: factory.id('category:0'),
      sellerUserId: factory.id('user:5'),
      shopId: null,
    };
    expect(
      factory.product(0, source, {
        condition: ProductCondition.FAIR,
        price: 250000,
      }).price,
    ).toBe(250000);
    expect(factory.product(0, source).price).toBe(120000);
    expect(factory.product(0, source).shopId).toBeNull();
    expect(factory.mediaLink(0, 0).role).toBe('COVER');
    expect(factory.mediaLink(0, 1).role).toBe('GALLERY');
  });

  it('rejects invalid size, namespace, clock and password options', () => {
    for (const productCount of [0, 11, 201, NaN, 12.5])
      expect(() => validateSeedOptions({ productCount })).toThrow(
        'Seed product count',
      );
    for (const namespace of ['', 'Hello', 'a/b', 'x'.repeat(33)])
      expect(() => validateSeedOptions({ namespace })).toThrow(
        'Seed namespace',
      );
    expect(() => validateSeedOptions({ now: new Date(NaN) })).toThrow(
      'Seed clock',
    );
    expect(() => validateSeedOptions({ password: 'short' })).toThrow(
      'Seed password',
    );
  });

  it('requires an explicit PostgreSQL target and refuses production', () => {
    const url = 'postgresql://postgres:postgres@127.0.0.1:5432/rewear_seed';
    expect(validateSeedTarget(url, 'development')).toBe(url);
    expect(() => validateSeedTarget(undefined, 'development')).toThrow(
      'Set SEED_DATABASE_URL',
    );
    expect(() => validateSeedTarget(url, 'production')).toThrow(
      'disabled in production',
    );
    expect(
      validateSeedTarget(
        url.replace('127.0.0.1', 'dev.example.com'),
        'development',
      ),
    ).toContain('dev.example.com');
    expect(() => validateSeedTarget('https://example.com', 'test')).toThrow(
      'requires PostgreSQL',
    );
    expect(() => validateSeedSchemaTarget(url)).not.toThrow();
    expect(() =>
      validateSeedSchemaTarget(url.replace('127.0.0.1', 'dev.example.com')),
    ).toThrow('Schema synchronization requires');
    expect(() =>
      validateSeedSchemaTarget(url.replace('/rewear_seed', '/rewear')),
    ).toThrow('Schema synchronization requires');
  });
});
