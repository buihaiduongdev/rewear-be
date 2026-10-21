import { AuthProvider } from '@/modules/auth/enums';
import {
  loginSchema,
  registerSchema,
} from '@/modules/auth/schemas/auth-input.schema';
import {
  createCategorySchema,
  updateCategorySchema,
} from '@/modules/category/schemas/category-input.schema';
import {
  createMediaUploadTicketSchema,
  reorderMediaSchema,
} from '@/modules/media/schemas/media-input.schema';
import { ProductCondition } from '@/modules/product/enums';
import {
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
} from '@/modules/product/schemas/product-input.schema';
import {
  createShopSchema,
  updateShopSchema,
} from '@/modules/shop/schemas/shop-input.schema';
import {
  createUserAddressSchema,
  updateUserAddressSchema,
} from '@/modules/user-address/schemas/user-address-input.schema';
import { updateUserSchema } from '@/modules/user/schemas/user-input.schema';

describe('Request schema compatibility', () => {
  const id = '598745cf-8764-499a-ad43-e6223713ee90';
  const product = {
    categoryId: id,
    title: '  Áo   khoác  ',
    condition: ProductCondition.GOOD,
    price: 0,
  };

  it('normalizes whitespace and keeps numeric boundaries without coercing body strings', () => {
    expect(createProductSchema.parse(product).title).toBe('Áo khoác');
    expect(
      createProductSchema.safeParse({ ...product, price: '100' }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...product, price: 2147483648 }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...product, title: '   ' }).success,
    ).toBe(false);
  });

  it('rejects writable ownership and status fields outside each request contract', () => {
    expect(updateProductSchema.safeParse({ shopId: id }).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...product, status: 'ACTIVE' }).success,
    ).toBe(false);
    expect(
      updateProductStatusSchema.safeParse({ status: 'HELD' }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: 'a@example.com',
        password: '12345678',
        fullName: 'An',
        role: 'ADMIN',
      }).success,
    ).toBe(false);
  });

  it.each([
    updateCategorySchema,
    updateShopSchema,
    updateProductSchema,
    updateUserSchema,
    updateUserAddressSchema,
  ])('allows an empty PATCH without applying create defaults', (schema) => {
    expect(schema.parse({})).toEqual({});
  });

  it('preserves explicit null for nullable text but treats legacy null optional flags as absent', () => {
    expect(
      updateUserAddressSchema.parse({
        label: null,
        addressLine2: null,
        postalCode: null,
        deliveryInstructions: null,
      }),
    ).toEqual({
      label: null,
      addressLine2: null,
      postalCode: null,
      deliveryInstructions: null,
    });
    expect(
      updateProductSchema.parse({ description: null, size: null }),
    ).toEqual({ description: null, size: null });
    expect(
      createCategorySchema.parse({ name: 'Áo', isActive: null }).isActive,
    ).toBeUndefined();
    expect(updateShopSchema.parse({ name: null }).name).toBeUndefined();
  });

  it('requires real booleans and valid two-level address codes', () => {
    const address = {
      recipientName: '  Nguyễn   An ',
      phone: '0912345678',
      addressLine1: ' 12  Nguyễn Huệ ',
      provinceCode: '79',
      wardCode: '25747',
    };
    expect(createUserAddressSchema.parse(address).recipientName).toBe(
      'Nguyễn An',
    );
    expect(
      createUserAddressSchema.safeParse({ ...address, isDefault: 'false' })
        .success,
    ).toBe(false);
    expect(
      createUserAddressSchema.safeParse({ ...address, provinceCode: '079' })
        .success,
    ).toBe(false);
    expect(
      createUserAddressSchema.safeParse({ ...address, wardCode: '123' })
        .success,
    ).toBe(false);
    expect(
      createUserAddressSchema.safeParse({ ...address, label: '' }).success,
    ).toBe(false);
  });

  it('preserves strict media array and upload validation', () => {
    expect(reorderMediaSchema.safeParse({ mediaIds: [id, id] }).success).toBe(
      false,
    );
    expect(reorderMediaSchema.parse({ mediaIds: [] })).toEqual({
      mediaIds: [],
    });
    expect(
      createMediaUploadTicketSchema.safeParse({
        mimeType: 'image/jpeg',
        sizeBytes: '12',
      }).success,
    ).toBe(false);
    expect(
      createMediaUploadTicketSchema.safeParse({
        mimeType: 'image/jpeg',
        sizeBytes: 0,
      }).success,
    ).toBe(false);
  });

  it('retains shop name validation before service-level trimming', () => {
    expect(createShopSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createShopSchema.parse({ name: '  Closet  ' }).name).toBe(
      '  Closet  ',
    );
  });

  it('validates login field types while strategies retain provider-specific credential checks', () => {
    expect(loginSchema.safeParse({ provider: 'UNKNOWN' }).success).toBe(false);
    expect(
      loginSchema.safeParse({
        provider: AuthProvider.CREDENTIALS,
        password: 123,
      }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ provider: AuthProvider.GOOGLE, token: {} })
        .success,
    ).toBe(false);
  });
});
