import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';

import { BaseFactory } from './base.factory';

export class PickupLocationFactory extends BaseFactory<PickupLocation> {
  definition(): DeepPartial<PickupLocation> {
    return {
      contactName: faker.person.fullName(),
      phone: '0909876543',
      addressLine1: faker.location.streetAddress(),
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'Thành phố Hồ Chí Minh',
      wardCode: '26743',
      wardName: 'Phường Bến Thành',
    };
  }
}
