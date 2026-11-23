import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';

describe('AdministrativeDivisionService', () => {
  const service = new AdministrativeDivisionService();

  it('exposes the 3-level snapshot', async () => {
    const provinces = await service.findAllProvinces();
    expect(provinces.length).toBeGreaterThan(0);
    expect(provinces.some((p) => p.name.includes('Hà Nội'))).toBe(true);
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
