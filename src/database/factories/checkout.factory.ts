import type { DeepPartial } from 'typeorm';

import { Checkout } from '@/modules/checkout/entities';

import { BaseFactory } from './base.factory';

export class CheckoutFactory extends BaseFactory<Checkout> {
  definition(): DeepPartial<Checkout> {
    return {};
  }
}
