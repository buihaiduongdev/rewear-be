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
      provinceId: 201,
      provinceName: 'Hà Nội',
      districtId: 1489,
      districtName: 'Quận Hoàn Kiếm',
      wardCode: '1A0206',
      wardName: 'Phường Hàng Bài',
      ghnSyncStatus: 'NOT_CONNECTED',
    };
  }
}
