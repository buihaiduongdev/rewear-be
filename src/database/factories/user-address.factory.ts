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
      provinceId: 202,
      provinceName: 'Hồ Chí Minh',
      districtId: 1442,
      districtName: 'Quận 1',
      wardCode: '20101',
      wardName: 'Phường Bến Nghé',
      isDefault: false,
    };
  }
}
