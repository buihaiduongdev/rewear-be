import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';

import type {
  AdministrativeDistrict,
  AdministrativeProvince,
  AdministrativeWard,
  ResolvedVietnamAddress,
} from './schemas';

@Injectable()
export class AdministrativeDivisionService {
  constructor(private readonly ghn: GhnShopClient) {}

  async findAllProvinces(): Promise<readonly AdministrativeProvince[]> {
    try {
      const raw = await this.ghn.provinces();
      return (raw || []).filter((p) => !/(^Test|\b02\b)/i.test(p.name));
    } catch {
      return [];
    }
  }

  async findDistrictsByProvinceId(
    provinceId: number,
  ): Promise<readonly AdministrativeDistrict[]> {
    try {
      const raw = await this.ghn.districts(provinceId);
      return (raw || []).map((d) => ({
        id: d.id,
        name: d.name,
        provinceId,
      }));
    } catch {
      throw new NotFoundException('Administrative province not found');
    }
  }

  async findWardsByDistrictId(
    districtId: number,
  ): Promise<readonly AdministrativeWard[]> {
    try {
      const raw = await this.ghn.wards(districtId);
      return (raw || []).map((w) => ({
        code: w.id,
        name: w.name,
        districtId,
      }));
    } catch {
      return [];
    }
  }

  async resolveAddress(
    provinceId: number,
    districtId: number,
    wardCode: string,
  ): Promise<ResolvedVietnamAddress> {
    const [provinces, districts, wards] = await Promise.all([
      this.findAllProvinces(),
      this.findDistrictsByProvinceId(provinceId).catch(
        (): readonly AdministrativeDistrict[] => [],
      ),
      this.findWardsByDistrictId(districtId),
    ]);

    const province = provinces.find((p) => p.id === provinceId);
    if (!province) throw new BadRequestException('Invalid province ID');

    const district = districts.find((d) => d.id === districtId);
    if (!district) throw new BadRequestException('Invalid district ID');

    const ward = wards.find((w) => w.code === wardCode);
    if (!ward) throw new BadRequestException('Invalid ward code');

    return {
      provinceId: province.id,
      provinceName: province.name,
      districtId: district.id,
      districtName: district.name,
      wardCode: ward.code,
      wardName: ward.name,
    };
  }
}
