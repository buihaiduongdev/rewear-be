import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';

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

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class AdministrativeDivisionService {
  private provincesCache: CacheEntry<readonly AdministrativeProvince[]> | null =
    null;
  private readonly districtsCache = new Map<
    number,
    CacheEntry<readonly AdministrativeDistrict[]>
  >();
  private readonly wardsCache = new Map<
    number,
    CacheEntry<readonly AdministrativeWard[]>
  >();

  constructor(@Optional() private readonly ghn?: GhnShopClient) {}

  async findAllProvinces(): Promise<readonly AdministrativeProvince[]> {
    const now = Date.now();
    if (this.provincesCache && this.provincesCache.expiresAt > now) {
      return this.provincesCache.data;
    }

    if (!this.ghn) {
      return [];
    }

    try {
      const raw = await this.ghn.provinces();
      const clean = (raw || []).filter((p) => !/(^Test|\b02\b)/i.test(p.name));
      this.provincesCache = {
        data: clean,
        expiresAt: now + CACHE_TTL_MS,
      };
      return clean;
    } catch {
      return this.provincesCache?.data ?? [];
    }
  }

  async findDistrictsByProvinceId(
    provinceId: number,
  ): Promise<readonly AdministrativeDistrict[]> {
    const now = Date.now();
    const cached = this.districtsCache.get(provinceId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    if (!this.ghn) {
      return [];
    }

    try {
      const raw = await this.ghn.districts(provinceId);
      const list: AdministrativeDistrict[] = (raw || []).map((d) => ({
        id: d.id,
        name: d.name,
        provinceId,
      }));
      this.districtsCache.set(provinceId, {
        data: list,
        expiresAt: now + CACHE_TTL_MS,
      });
      return list;
    } catch {
      if (cached?.data) return cached.data;
      throw new NotFoundException('Administrative province not found');
    }
  }

  async findWardsByDistrictId(
    districtId: number,
  ): Promise<readonly AdministrativeWard[]> {
    const now = Date.now();
    const cached = this.wardsCache.get(districtId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    if (!this.ghn) {
      return [];
    }

    try {
      const raw = await this.ghn.wards(districtId);
      const list: AdministrativeWard[] = (raw || []).map((w) => ({
        code: w.id,
        name: w.name,
        districtId,
      }));
      this.wardsCache.set(districtId, {
        data: list,
        expiresAt: now + CACHE_TTL_MS,
      });
      return list;
    } catch {
      if (cached?.data) return cached.data;
      return [];
    }
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
