import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { Product } from '@/modules/product/entities';

import { Cart } from './cart.entity';

@Entity('cart_items')
@Index('IDX_cart_items_product', ['productId'])
@Index('UQ_cart_items_cart_product', ['cartId', 'productId'], { unique: true })
export class CartItem extends BaseEntity {
  @Column('uuid')
  cartId: string;

  @ManyToOne(() => Cart, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart: Cart;

  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;
}
