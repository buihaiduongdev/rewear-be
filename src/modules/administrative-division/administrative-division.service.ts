import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  type AdministrativeProvince,
  type AdministrativeWard,
  VIETNAM_PROVINCES,
  VIETNAM_WARDS,
} from './data';

export interface ResolvedVietnamAddress {
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
}

@Injectable()
export class AdministrativeDivisionService {
  private readonly provinceByCode = new Map(
    VIETNAM_PROVINCES.map((province) => [province.code, province]),
  );

  private readonly wardByCode = new Map(
    VIETNAM_WARDS.map((ward) => [ward.code, ward]),
  );

  private readonly wardsByProvinceCode = VIETNAM_WARDS.reduce(
    (wardsByProvinceCode, ward) => {
      const wards = wardsByProvinceCode.get(ward.provinceCode) ?? [];
      wards.push(ward);
      wardsByProvinceCode.set(ward.provinceCode, wards);
      return wardsByProvinceCode;
    },
    new Map<string, AdministrativeWard[]>(),
  );

  findAllProvinces(): readonly AdministrativeProvince[] {
    return VIETNAM_PROVINCES;
  }

  findWardsByProvinceCode(provinceCode: string): readonly AdministrativeWard[] {
    if (!this.provinceByCode.has(provinceCode)) {
      throw new NotFoundException('Administrative province not found');
    }

    return this.wardsByProvinceCode.get(provinceCode) ?? [];
  }

  resolveAddress(
    provinceCode: string,
    wardCode: string,
  ): ResolvedVietnamAddress {
    const province = this.provinceByCode.get(provinceCode);
    if (!province) {
      throw new BadRequestException('Invalid province code');
    }

    const ward = this.wardByCode.get(wardCode);
    if (!ward) {
      throw new BadRequestException('Invalid ward code');
    }

    if (ward.provinceCode !== province.code) {
      throw new BadRequestException(
        'Ward does not belong to the selected province',
      );
    }

    return {
      provinceCode: province.code,
      provinceName: province.name,
      wardCode: ward.code,
      wardName: ward.name,
    };
  }
}
