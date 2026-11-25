import { randomUUID } from 'node:crypto';

import { CategoryFactory } from '@/database/factories/category.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserAddressFactory } from '@/database/factories/user-address.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { CartService } from '@/modules/cart/cart.service';
import { Category } from '@/modules/category/entities';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import {
  snapshotFeeDisclosure,
  verifyFeeDisclosure,
} from '@/modules/fees/disclosure/fee-disclosure';
import {
  FeePolicy,
  FeePolicyShopAcceptance,
} from '@/modules/fees/disclosure/fee-disclosure.entity';
import { FeeDisclosureService } from '@/modules/fees/disclosure/fee-disclosure.service';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopMember } from '@/modules/shop/entities/shop-member.entity';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('Versioned fee disclosure (PostgreSQL)', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.destroy());
  it('publishes immutable versions and only authorizes prior explicit party acceptance', async () => {
    const db = database.dataSource;
    const service = new FeeDisclosureService(db);
    const owner = await db
      .getRepository(User)
      .save(new UserFactory().build({ status: UserStatus.ACTIVE }));
    const admin = await db.getRepository(User).save(
      new UserFactory().build({
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      }),
    );
    await expect(service.publish(owner.id, { conditions: [] })).rejects.toThrow(
      'Admin',
    );
    const outsider = await db
      .getRepository(User)
      .save(new UserFactory().build());
    const shop = await db.getRepository(Shop).save(new ShopFactory().build());
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: owner.id,
      memberRole: ShopMemberRole.OWNER,
    });
    const policy = await service.publish(admin.id, {
      conditions: [
        {
          kind: 'CANCELLATION',
          text: 'Verified actual invoiced cancellation costs attributable to the responsible party.',
        },
      ],
    });
    await expect(
      service.accept(outsider.id, shop.id, policy.id),
    ).rejects.toThrow('Owner');
    await service.accept(owner.id, shop.id, policy.id);
    const now = new Date();
    const snapshot = await snapshotFeeDisclosure(
      db.manager,
      { feePolicyId: policy.id, feeTermsAccepted: true },
      [shop.id],
      now,
    );
    const order = {
      shopId: shop.id,
      createdAt: new Date(now.getTime() + 1),
      feeDisclosure: snapshot,
    };
    expect(
      await verifyFeeDisclosure(db.manager, order, 'BUYER', 'CANCELLATION'),
    ).toBe(true);
    expect(
      await verifyFeeDisclosure(db.manager, order, 'SHOP', 'CANCELLATION'),
    ).toBe(true);
    expect(
      await verifyFeeDisclosure(db.manager, order, 'BUYER', 'REFUSAL_EXTRA'),
    ).toBe(false);
    expect(
      await verifyFeeDisclosure(
        db.manager,
        { ...order, feeDisclosure: null },
        'SHOP',
        'CANCELLATION',
      ),
    ).toBe(false);
    const noBuyer = await snapshotFeeDisclosure(db.manager, {}, [shop.id], now);
    expect(
      await verifyFeeDisclosure(
        db.manager,
        { ...order, feeDisclosure: noBuyer },
        'BUYER',
        'CANCELLATION',
      ),
    ).toBe(false);
    const next = await service.publish(admin.id, {
      conditions: [
        {
          kind: 'CANCELLATION',
          text: 'Updated actual invoice and verified fault cancellation conditions.',
        },
      ],
    });
    expect(next.version).toBe(policy.version + 1);
    expect(
      (await db.manager.findOneByOrFail(FeePolicy, { id: policy.id }))
        .conditions,
    ).toEqual(policy.conditions);
    await expect(
      snapshotFeeDisclosure(
        db.manager,
        { feePolicyId: policy.id, feeTermsAccepted: true },
        [shop.id],
        new Date(),
      ),
    ).rejects.toThrow('current');
    expect(
      await verifyFeeDisclosure(db.manager, order, 'BUYER', 'CANCELLATION'),
    ).toBe(true);
    const address = await db
      .getRepository(UserAddress)
      .save(new UserAddressFactory().build({ userId: outsider.id }));
    const category = await db
      .getRepository(Category)
      .save(new CategoryFactory().build());
    const product = await db.getRepository(Product).save(
      new ProductFactory().build({
        categoryId: category.id,
        shopId: shop.id,
        status: ProductStatus.ACTIVE,
      }),
    );
    await db.getRepository(ProductModeration).save({
      productId: product.id,
      status: ProductModerationStatus.APPROVED,
      version: 1,
      reason: null,
    });
    const cartService = new CartService(db, {
      getPublicUrl: (key: string) => `https://public.test/${key}`,
    } as never);
    await cartService.add(outsider.id, product.id);
    const checkoutService = new CheckoutService(db, cartService);
    const checkoutInput = {
      requestId: randomUUID(),
      addressId: address.id,
      productIds: [product.id],
      feePolicyId: next.id,
      feeTermsAccepted: true as const,
    };
    const checkout = await checkoutService.create(outsider.id, checkoutInput);
    expect(checkout.feeDisclosure?.policyId).toBe(next.id);
    expect(checkout.status).toBe('HELD');
    expect(checkout.expiresAt).not.toBeNull();
    const replay = await checkoutService.create(outsider.id, checkoutInput);
    expect(replay.feeDisclosure).toEqual(checkout.feeDisclosure);
    expect(replay.expiresAt).toEqual(checkout.expiresAt);
    await expect(
      checkoutService.create(outsider.id, {
        ...checkoutInput,
        feePolicyId: policy.id,
      }),
    ).rejects.toThrow('Request ID');
    await db.manager.update(User, owner.id, { status: UserStatus.INACTIVE });
    await expect(service.accept(owner.id, shop.id, next.id)).rejects.toThrow(
      'Active',
    );
    await db.manager.update(User, owner.id, { status: UserStatus.ACTIVE });
    await db.manager.update(Shop, shop.id, { status: ShopStatus.INACTIVE });
    await expect(service.accept(owner.id, shop.id, next.id)).rejects.toThrow(
      'Active',
    );
    await db.manager.update(Shop, shop.id, { status: ShopStatus.ACTIVE });
    const beforeAcceptance = new Date(policy.publishedAt.getTime() - 1);
    expect(
      await verifyFeeDisclosure(
        db.manager,
        { ...order, createdAt: beforeAcceptance },
        'SHOP',
        'CANCELLATION',
      ),
    ).toBe(false);
    expect(
      await db.manager.countBy(FeePolicyShopAcceptance, {
        shopId: shop.id,
        policyId: next.id,
      }),
    ).toBe(0);
    expect(
      await verifyFeeDisclosure(
        db.manager,
        { ...order, feeDisclosure: { ...snapshot!, policyId: randomUUID() } },
        'BUYER',
        'CANCELLATION',
      ),
    ).toBe(false);
  });
});
