import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { UserAddress } from '@/modules/user-address/entities';

import { BaseFactory } from './base.factory';

export class UserAddressFactory extends BaseFactory<UserAddress> {
  definition(): DeepPartial<UserAddress> {
    return {
      recipientName: faker.person.fullName(),
      phone: '0901234567',
      addressLine1: faker.location.streetAddress(),
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'Thành phố Hồ Chí Minh',
      wardCode: '26743',
      wardName: 'Phường Bến Thành',
      isDefault: false,
    };
  }
}
