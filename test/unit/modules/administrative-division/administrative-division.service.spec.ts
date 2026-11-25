import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';
import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';

describe('AdministrativeDivisionService', () => {
  const mockGhn: jest.Mocked<
    Pick<GhnShopClient, 'provinces' | 'districts' | 'wards'>
  > = {
    provinces: jest.fn().mockResolvedValue([
      { id: 201, name: 'Hà Nội' },
      { id: 202, name: 'Hồ Chí Minh' },
      { id: 2002, name: 'Hà Nội 02' },
      { id: 298, name: 'Test - Alert - Tỉnh - 001' },
    ]),
    districts: jest.fn().mockImplementation(async (provinceId: number) => {
      if (provinceId === 201) {
        return [{ id: 1489, name: 'Quận Hoàn Kiếm' }];
      }
      if (provinceId === 202) {
        return [{ id: 1442, name: 'Quận 1' }];
      }
      throw new Error('GHN_CATALOG_UNAVAILABLE');
    }),
    wards: jest.fn().mockImplementation(async (districtId: number) => {
      if (districtId === 1489) {
        return [{ id: '1A0206', name: 'Phường Hàng Bài' }];
      }
      if (districtId === 1442) {
        return [{ id: '20101', name: 'Phường Bến Nghé' }];
      }
      return [];
    }),
  };

  const service = new AdministrativeDivisionService(
    mockGhn as unknown as GhnShopClient,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes provinces filtered from GHN', async () => {
    const provinces = await service.findAllProvinces();
    expect(provinces.length).toBe(2);
    expect(provinces.some((p) => p.name === 'Hà Nội')).toBe(true);
    expect(provinces.some((p) => p.name.includes('Test'))).toBe(false);
    expect(provinces.some((p) => p.name.includes('02'))).toBe(false);
  });

  it('resolves canonical 3-level address', async () => {
    // 201: Hanoi, 1489: Hoan Kiem, 1A0206: Hang Bai
    const resolved = await service.resolveAddress(201, 1489, '1A0206');
    expect(resolved).toEqual({
      provinceId: 201,
      provinceName: 'Hà Nội',
      districtId: 1489,
      districtName: 'Quận Hoàn Kiếm',
      wardCode: '1A0206',
      wardName: 'Phường Hàng Bài',
    });
  });

  it('rejects an unknown province when listing districts', async () => {
    await expect(service.findDistrictsByProvinceId(999999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects invalid combinations on resolveAddress', async () => {
    await expect(
      service.resolveAddress(999999, 1489, '1A0206'),
    ).rejects.toThrow(BadRequestException);
    await expect(service.resolveAddress(201, 999999, '1A0206')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.resolveAddress(201, 1489, 'INVALID_WARD'),
    ).rejects.toThrow(BadRequestException);
  });
});
