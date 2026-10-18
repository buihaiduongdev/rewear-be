import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';
import {
  VIETNAM_ADMINISTRATIVE_DIVISION_SNAPSHOT,
  VIETNAM_WARDS,
} from '@/modules/administrative-division/data';

describe('AdministrativeDivisionService', () => {
  const service = new AdministrativeDivisionService();

  it('exposes the complete two-level snapshot', () => {
    const provinces = service.findAllProvinces();

    expect(provinces).toHaveLength(
      VIETNAM_ADMINISTRATIVE_DIVISION_SNAPSHOT.provinceCount,
    );
    expect(VIETNAM_WARDS).toHaveLength(
      VIETNAM_ADMINISTRATIVE_DIVISION_SNAPSHOT.wardCount,
    );
    expect(new Set(provinces.map(({ code }) => code)).size).toBe(
      provinces.length,
    );
    expect(new Set(VIETNAM_WARDS.map(({ code }) => code)).size).toBe(
      VIETNAM_WARDS.length,
    );
  });

  it('preserves leading zeroes and resolves canonical names', () => {
    expect(service.resolveAddress('01', '00004')).toEqual({
      provinceCode: '01',
      provinceName: 'Thành phố Hà Nội',
      wardCode: '00004',
      wardName: 'Phường Ba Đình',
    });
  });

  it('uses current province names from the official directory', () => {
    expect(service.findAllProvinces()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: '22', name: 'Thành phố Quảng Ninh' }),
        expect.objectContaining({ code: '24', name: 'Thành phố Bắc Ninh' }),
        expect.objectContaining({ code: '75', name: 'Thành phố Đồng Nai' }),
      ]),
    );
  });

  it('keeps the corrected Ba Chẽ ward code', () => {
    expect(service.resolveAddress('22', '06970')).toEqual({
      provinceCode: '22',
      provinceName: 'Thành phố Quảng Ninh',
      wardCode: '06970',
      wardName: 'Xã Ba Chẽ',
    });
  });

  it('rejects an unknown province when listing wards', () => {
    expect(() => service.findWardsByProvinceCode('00')).toThrow(
      NotFoundException,
    );
  });

  it('rejects a ward outside the selected province', () => {
    expect(() => service.resolveAddress('79', '00004')).toThrow(
      BadRequestException,
    );
  });
});
