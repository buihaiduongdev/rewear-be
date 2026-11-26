import type { DeepPartial } from 'typeorm';

import { Order } from '@/modules/order/entities';

import { BaseFactory } from './base.factory';

export class OrderFactory extends BaseFactory<Order> {
  definition(): DeepPartial<Order> {
    return {};
  }
}
