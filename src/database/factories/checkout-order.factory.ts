import type { DeepPartial } from 'typeorm';

import { CheckoutOrder } from '@/modules/checkout/entities';

import { BaseFactory } from './base.factory';

export class CheckoutOrderFactory extends BaseFactory<CheckoutOrder> {
  definition(): DeepPartial<CheckoutOrder> {
    return {};
  }
}
