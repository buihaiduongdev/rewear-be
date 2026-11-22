import { createHash, randomUUID } from 'node:crypto';

import type { EntityManager } from 'typeorm';

import { CartItemFactory } from '@/database/factories/cart-item.factory';
import { CartFactory } from '@/database/factories/cart.factory';
import { CategoryFactory } from '@/database/factories/category.factory';
import { ChatConversationFactory } from '@/database/factories/chat-conversation.factory';
import { ChatMessageFactory } from '@/database/factories/chat-message.factory';
import { CheckoutOrderFactory } from '@/database/factories/checkout-order.factory';
import { CheckoutFactory } from '@/database/factories/checkout.factory';
import { MediaLinkFactory } from '@/database/factories/media-link.factory';
import { MediaFactory } from '@/database/factories/media.factory';
import { OrderFactory } from '@/database/factories/order.factory';
import { PickupLocationFactory } from '@/database/factories/pickup-location.factory';
import { ProductModerationFactory } from '@/database/factories/product-moderation.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopFollowFactory } from '@/database/factories/shop-follow.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserAddressFactory } from '@/database/factories/user-address.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { WishlistItemFactory } from '@/database/factories/wishlist-item.factory';
import { ShopRoleService } from '@/modules/authorization/shop-role.service';
import { Cart, CartItem } from '@/modules/cart/entities';
import { Category } from '@/modules/category/entities';
import { notifyChatMessage } from '@/modules/chat/chat-message.notification';
import { CHAT_SIDE } from '@/modules/chat/constants/chat.constant';
import {
  ChatConversation,
  ChatMessage,
} from '@/modules/chat/entities/chat.entity';
import { sendChatSchema } from '@/modules/chat/schemas/chat.schema';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout, CheckoutOrder } from '@/modules/checkout/entities';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaRole } from '@/modules/media/enums';
import {
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_POLICY,
  ORDER_STATUS,
} from '@/modules/order/constants';
import { Order, OrderEvent } from '@/modules/order/entities/order.entity';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductCondition,
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopFollow } from '@/modules/shop-follows/entities/shop-follow.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import { WishlistItem } from '@/modules/wishlist/entities';

import {
  DEFAULT_SEED_PASSWORD,
  SEED_ACCOUNTS,
  SEED_CATEGORIES,
  SEED_PICKUP_LOCATIONS,
  SEED_SHOPS,
  SEED_USER_ADDRESSES,
} from './catalog';

export async function runInitialDataSeed(manager: EntityManager) {
  const userFactory = new UserFactory(manager.getRepository(User));
  const categoryFactory = new CategoryFactory(manager.getRepository(Category));
  const shopFactory = new ShopFactory(manager.getRepository(Shop));
  const memberFactory = new ShopMemberFactory(
    manager.getRepository(ShopMember),
  );
  const productFactory = new ProductFactory(manager.getRepository(Product));
  const moderationFactory = new ProductModerationFactory(
    manager.getRepository(ProductModeration),
  );
  const mediaFactory = new MediaFactory(manager.getRepository(Media));
  const linkFactory = new MediaLinkFactory(manager.getRepository(MediaLink));
  const userAddressFactory = new UserAddressFactory(
    manager.getRepository(UserAddress),
  );
  const pickupLocationFactory = new PickupLocationFactory(
    manager.getRepository(PickupLocation),
  );
  const cartFactory = new CartFactory(manager.getRepository(Cart));
  const cartItemFactory = new CartItemFactory(manager.getRepository(CartItem));
  const checkoutFactory = new CheckoutFactory(manager.getRepository(Checkout));
  const checkoutOrderFactory = new CheckoutOrderFactory(
    manager.getRepository(CheckoutOrder),
  );
  const orderFactory = new OrderFactory(manager.getRepository(Order));
  const wishlistItemFactory = new WishlistItemFactory(
    manager.getRepository(WishlistItem),
  );
  const shopFollowFactory = new ShopFollowFactory(
    manager.getRepository(ShopFollow),
  );
  const chatConversationFactory = new ChatConversationFactory(
    manager.getRepository(ChatConversation),
  );
  const chatMessageFactory = new ChatMessageFactory(
    manager.getRepository(ChatMessage),
  );

  const users: User[] = [];
  for (const [index, account] of SEED_ACCOUNTS.entries()) {
    users.push(
      await userFactory.create(
        {
          fullName: account.fullName,
          email: `${account.key}.demo@seed.rewear.test`,
          role: index === 0 ? UserRole.ADMIN : UserRole.USER,
        },
        { password: DEFAULT_SEED_PASSWORD },
      ),
    );
  }

  const categories: Category[] = [];
  for (const category of SEED_CATEGORIES) {
    categories.push(
      await categoryFactory.create({
        name: category.name,
        slug: `seed-demo-${category.slug}`,
        requiredMeasurements: category.requiredMeasurements,
      }),
    );
  }

  const shops: Shop[] = [];
  for (const [index, data] of SEED_SHOPS.entries()) {
    const shop = await shopFactory.create(data);
    await memberFactory.create({
      shopId: shop.id,
      userId: users[index + 2].id,
    });
    await new ShopRoleService(manager.connection).initializeDefaultRoles(
      shop.id,
      manager,
    );
    shops.push(shop);
  }

  const products: Product[] = [];
  const states = [
    ProductStatus.DRAFT,
    ProductStatus.PENDING_REVIEW,
    ProductStatus.REJECTED,
    ProductStatus.HIDDEN,
    ProductStatus.HELD,
    ProductStatus.SOLD,
  ];
  for (let index = 0; index < 36; index++) {
    const category = categories[index % categories.length];
    const shopIndex = Math.floor(index / categories.length) % shops.length;
    const status = index < 30 ? ProductStatus.ACTIVE : states[index - 30];
    const product = await productFactory.create({
      categoryId: status === ProductStatus.DRAFT ? null : category.id,
      shopId: shops[shopIndex].id,
      title:
        status === ProductStatus.DRAFT
          ? null
          : `${SEED_CATEGORIES[index % categories.length].title} ${Math.floor(index / categories.length) + 1}`,
      description:
        status === ProductStatus.DRAFT
          ? null
          : 'Pre-loved clothing in good condition.',
      condition: status === ProductStatus.DRAFT ? null : ProductCondition.GOOD,
      price:
        status === ProductStatus.DRAFT ? null : 120000 + (index % 12) * 35000,
      shippingPackage:
        status === ProductStatus.DRAFT
          ? null
          : {
              weightGrams: 300 + (index % 5) * 50,
              lengthCm: 25,
              widthCm: 20,
              heightCm: 5,
            },
      status,
      publishedAt: [
        ProductStatus.ACTIVE,
        ProductStatus.HIDDEN,
        ProductStatus.HELD,
        ProductStatus.SOLD,
      ].includes(status)
        ? new Date()
        : null,
      heldUntil:
        status === ProductStatus.HELD ? new Date(Date.now() + 600000) : null,
      soldAt: status === ProductStatus.SOLD ? new Date() : null,
    });
    products.push(product);
    if (status !== ProductStatus.DRAFT) {
      await moderationFactory.create({
        productId: product.id,
        status:
          status === ProductStatus.PENDING_REVIEW
            ? ProductModerationStatus.PENDING
            : status === ProductStatus.REJECTED
              ? ProductModerationStatus.REJECTED
              : ProductModerationStatus.APPROVED,
        reason:
          status === ProductStatus.REJECTED
            ? 'Demo rejection: add a clearer label photo.'
            : null,
      });
    }
    for (const [slot, angle] of ['FRONT', 'BACK', 'DETAIL'].entries()) {
      const item = SEED_CATEGORIES[index % categories.length];
      const media = await mediaFactory.create({
        uploadedById: users[shopIndex + 2].id,
        url: `https://images.unsplash.com/${item.photo}?w=800&fit=crop&q=80&fm=jpg`,
        sizeBytes: item.sizeBytes,
      });
      await linkFactory.create({
        mediaId: media.id,
        ownerId: product.id,
        role: slot === 0 ? MediaRole.COVER : MediaRole.GALLERY,
        angle,
        sortOrder: slot,
      });
    }
  }

  const userByKey = new Map<string, User>();
  for (const [index, account] of SEED_ACCOUNTS.entries()) {
    userByKey.set(account.key, users[index]);
  }

  const userAddresses: UserAddress[] = [];
  for (const addressData of SEED_USER_ADDRESSES) {
    const user = userByKey.get(addressData.accountKey);
    if (!user) continue;
    userAddresses.push(
      await userAddressFactory.create({
        userId: user.id,
        recipientName: addressData.recipientName,
        phone: addressData.phone,
        addressLine1: addressData.addressLine1,
        provinceCode: addressData.provinceCode,
        provinceName: addressData.provinceName,
        wardCode: addressData.wardCode,
        wardName: addressData.wardName,
        label: addressData.label ?? null,
        countryCode: 'VN',
        isDefault: addressData.isDefault,
      }),
    );
  }

  const pickupLocations: PickupLocation[] = [];
  for (const locationData of SEED_PICKUP_LOCATIONS) {
    const shop = shops[locationData.shopIndex];
    if (!shop) continue;
    pickupLocations.push(
      await pickupLocationFactory.create({
        shopId: shop.id,
        contactName: locationData.contactName,
        phone: locationData.phone,
        addressLine1: locationData.addressLine1,
        provinceCode: locationData.provinceCode,
        provinceName: locationData.provinceName,
        wardCode: locationData.wardCode,
        wardName: locationData.wardName,
        countryCode: 'VN',
      }),
    );
  }

  // Seed cart with initial items for demo accounts (Admin and Buyer)
  const admin = users[0];
  const buyer = users[1];
  const adminCart = await cartFactory.create({ userId: admin.id });
  const buyerCart = await cartFactory.create({ userId: buyer.id });

  const adminCartItems: CartItem[] = [
    await cartItemFactory.create({
      cartId: adminCart.id,
      productId: products[0].id,
    }),
    await cartItemFactory.create({
      cartId: adminCart.id,
      productId: products[1].id,
    }),
    await cartItemFactory.create({
      cartId: adminCart.id,
      productId: products[6].id,
    }),
  ];

  const buyerCartItems: CartItem[] = [
    await cartItemFactory.create({
      cartId: buyerCart.id,
      productId: products[2].id,
    }),
    await cartItemFactory.create({
      cartId: buyerCart.id,
      productId: products[7].id,
    }),
  ];

  // Pending COD orders keep their own reserved products, separate from the demo carts.
  const buyerAddress = userAddresses.find(
    (address) => address.userId === buyer.id && address.isDefault,
  );
  if (!buyerAddress) throw new Error('Seed buyer must have a default address');
  const orders: Order[] = [];
  for (const [index, shop] of shops.entries()) {
    const sellerConfirmBy = new Date(
      Date.now() + ORDER_POLICY.SELLER_CONFIRM_WINDOW_MS,
    );
    const product = await productFactory.create({
      categoryId: categories[index].id,
      shopId: shop.id,
      title: `Seed order item ${index + 1}`,
      status: ProductStatus.HELD,
      heldUntil: null,
    });
    await moderationFactory.create({
      productId: product.id,
      status: ProductModerationStatus.APPROVED,
      reason: null,
    });
    const subtotal = product.price!;
    const shippingFee = 30000;
    const address = {
      recipientName: buyerAddress.recipientName,
      phone: buyerAddress.phone,
      addressLine1: buyerAddress.addressLine1,
      addressLine2: null,
      countryCode: buyerAddress.countryCode,
      provinceCode: buyerAddress.provinceCode,
      provinceName: buyerAddress.provinceName,
      wardCode: buyerAddress.wardCode,
      wardName: buyerAddress.wardName,
      postalCode: null,
      deliveryInstructions: null,
    };
    const items = [
      {
        productId: product.id,
        title: product.title!,
        price: subtotal,
        size: product.size,
        condition: product.condition!,
        coverUrl: null,
        shippingPackage: product.shippingPackage,
      },
    ];
    const checkout = await checkoutFactory.create({
      buyerId: buyer.id,
      requestId: randomUUID(),
      addressId: buyerAddress.id,
      address,
      requestedProductIds: [product.id],
      status: CHECKOUT_STATUS.COD_PLACED,
      expiresAt: null,
      removedItems: [],
    });
    const checkoutOrder = await checkoutOrderFactory.create({
      checkoutId: checkout.id,
      shopId: shop.id,
      address,
      items,
      subtotal,
      shippingFee,
    });
    const order = await orderFactory.create({
      checkoutId: checkout.id,
      checkoutOrderId: checkoutOrder.id,
      paymentMethod: ORDER_PAYMENT_METHOD.COD,
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      status: ORDER_STATUS.PENDING,
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      sellerConfirmBy,
      address,
      items,
    });
    await manager.getRepository(OrderEvent).save({
      orderId: order.id,
      action: ORDER_EVENT_ACTION.PLACED,
      actorId: buyer.id,
      reason: null,
    });
    await manager
      .getRepository(Product)
      .update(product.id, { reservedOrderId: order.id });
    orders.push(order);
  }

  const wishlist: WishlistItem[] = [];
  for (const product of [products[0], products[6], products[12]]) {
    wishlist.push(
      await wishlistItemFactory.create({
        userId: buyer.id,
        productId: product.id,
      }),
    );
  }
  const follows: ShopFollow[] = [];
  const conversations: ChatConversation[] = [];
  for (const shop of shops) {
    follows.push(
      await shopFollowFactory.create({ userId: buyer.id, shopId: shop.id }),
    );
    const conversation = await chatConversationFactory.create({
      buyerId: buyer.id,
      shopId: shop.id,
      lastSequence: 1,
      buyerReadSequence: 1,
      shopReadSequence: 0,
      lastMessageAt: new Date(),
    });
    const payload = sendChatSchema.parse({
      clientMessageId: randomUUID(),
      text: 'Hello! Is this item still available?',
    });
    const message = await chatMessageFactory.create({
      conversationId: conversation.id,
      sequence: 1,
      senderId: buyer.id,
      senderSide: CHAT_SIDE.BUYER,
      clientMessageId: payload.clientMessageId,
      fingerprint: createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex'),
      text: payload.text,
      mediaIds: payload.mediaIds,
      card: null,
    });
    await notifyChatMessage(manager, conversation, message);
    conversations.push(conversation);
  }

  const carts: Cart[] = [adminCart, buyerCart];
  const cartItems: CartItem[] = [...adminCartItems, ...buyerCartItems];

  return {
    users,
    shops,
    categories,
    products,
    userAddresses,
    pickupLocations,
    carts,
    cartItems,
    orders,
    wishlist,
    follows,
    conversations,
    cart: adminCart,
  };
}
