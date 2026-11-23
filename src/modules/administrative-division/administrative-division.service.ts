import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';

import snapshot from './data/ghn-divisions-snapshot.json';

export interface AdministrativeProvince {
  id: number;
  name: string;
}

export interface AdministrativeDistrict {
  id: number;
  name: string;
  provinceId: number;
}

export interface AdministrativeWard {
  code: string;
  name: string;
  districtId: number;
}

export interface ResolvedVietnamAddress {
  provinceId: number;
  provinceName: string;
  districtId: number;
  districtName: string;
  wardCode: string;
  wardName: string;
}

@Injectable()
export class AdministrativeDivisionService {
  constructor(@Optional() private readonly ghn?: GhnShopClient) {}

  private readonly provincesSnapshot: AdministrativeProvince[] =
    snapshot.provinces;
  private readonly districtsSnapshot: AdministrativeDistrict[] =
    snapshot.districts;
  private readonly wardsSnapshot: AdministrativeWard[] = snapshot.wards;

  private readonly provinceById = new Map<number, AdministrativeProvince>(
    snapshot.provinces.map((p) => [p.id, p]),
  );

  async findAllProvinces(): Promise<readonly AdministrativeProvince[]> {
    if (this.ghn) {
      try {
        const remote = await this.ghn.provinces();
        if (remote?.length) {
          remote.forEach((p) => this.provinceById.set(p.id, p));
          return remote;
        }
      } catch {}
    }
    return this.provincesSnapshot;
  }

  async findDistrictsByProvinceId(
    provinceId: number,
  ): Promise<readonly AdministrativeDistrict[]> {
    if (this.ghn) {
      try {
        const remote = await this.ghn.districts(provinceId);
        if (remote?.length) {
          return remote.map((d) => ({
            id: d.id,
            name: d.name,
            provinceId,
          }));
        }
      } catch {}
    }
    const matched = this.districtsSnapshot.filter(
      (d) => d.provinceId === provinceId,
    );
    if (!matched.length && !this.provinceById.has(provinceId)) {
      throw new NotFoundException('Administrative province not found');
    }
    return matched;
  }

  async findWardsByDistrictId(
    districtId: number,
  ): Promise<readonly AdministrativeWard[]> {
    if (this.ghn) {
      try {
        const remote = await this.ghn.wards(districtId);
        if (remote?.length) {
          return remote.map((w) => ({
            code: w.id,
            name: w.name,
            districtId,
          }));
        }
      } catch {}
    }
    const matched = this.wardsSnapshot.filter(
      (w) => w.districtId === districtId,
    );
    return matched;
  }

  async resolveAddress(
    provinceId: number,
    districtId: number,
    wardCode: string,
  ): Promise<ResolvedVietnamAddress> {
    const provinces = await this.findAllProvinces();
    const province = provinces.find((p) => p.id === provinceId);
    if (!province) throw new BadRequestException('Invalid province ID');

    const districts = await this.findDistrictsByProvinceId(provinceId);
    const district = districts.find((d) => d.id === districtId);
    if (!district) throw new BadRequestException('Invalid district ID');

    const wards = await this.findWardsByDistrictId(districtId);
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
