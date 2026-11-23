import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource } from 'typeorm';

import { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';
import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';
import { Shop } from '@/modules/shop/entities';

import { PickupLocation } from './entities/pickup-location.entity';
import type {
  ConnectGhnShopInput,
  SavePickupLocationInput,
} from './schemas/pickup-location.schema';

@Injectable()
export class PickupLocationService {
  constructor(
    private readonly db: DataSource,
    private readonly administrativeDivisionService: AdministrativeDivisionService,
    private readonly ghn: GhnShopClient,
  ) {}

  async read(shopId: string) {
    const location = await this.db
      .getRepository(PickupLocation)
      .findOneBy({ shopId });
    return { location };
  }

  async readGhnShop(shopId: string) {
    const location = await this.db
      .getRepository(PickupLocation)
      .findOneBy({ shopId });
    if (!location?.ghnShopId)
      throw new NotFoundException('No GHN shop is linked');
    let remote: Awaited<ReturnType<GhnShopClient['findOwnedShop']>>;
    try {
      remote = await this.ghn.findOwnedShop(location.ghnShopId);
    } catch {
      throw new ServiceUnavailableException(
        'GHN shop information is unavailable',
      );
    }
    if (!remote)
      throw new NotFoundException('Linked shop was not found in GHN');
    return {
      shopId: remote._id,
      name: remote.name,
      phone: remote.phone,
      address: remote.address,
      districtId: remote.district_id,
      wardCode: remote.ward_code,
      active: remote.status === 1,
    };
  }

  async save(userId: string, input: SavePickupLocationInput, shopId: string) {
    return this.db.transaction(async (manager) => {
      const address = this.administrativeDivisionService.resolveAddress(
        input.provinceCode,
        input.wardCode,
      );
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        shopId,
      ]);
      const existing = await manager.findOneBy(PickupLocation, { shopId });
      if (existing?.ghnSyncStatus === 'CREATING')
        throw new ConflictException('GHN connection is in progress');
      const changed =
        existing &&
        [
          'contactName',
          'phone',
          'addressLine1',
          'provinceCode',
          'wardCode',
        ].some(
          (key) =>
            existing[key as keyof SavePickupLocationInput] !==
            input[key as keyof SavePickupLocationInput],
        );
      if (changed && existing?.ghnSyncStatus === 'UNKNOWN')
        throw new ConflictException(
          'Resolve the uncertain GHN connection before changing this address',
        );
      if (changed && existing?.ghnSyncStatus === 'CONNECTED')
        existing.ghnSyncStatus = 'STALE';
      const location =
        existing ??
        manager.create(PickupLocation, {
          shopId,
        });
      manager.merge<PickupLocation>(PickupLocation, location, input, address, {
        countryCode: 'VN',
      });
      return { location: await manager.save(PickupLocation, location) };
    });
  }
  async ghnProvinces() {
    return this.ghn.provinces();
  }
  async ghnDistricts(provinceId: number) {
    return this.ghn.districts(provinceId);
  }
  async ghnWards(districtId: number) {
    return this.ghn.wards(districtId);
  }

  async disconnectGhn(shopId: string) {
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        shopId,
      ]);
      const location = await manager.findOneBy(PickupLocation, { shopId });
      if (!location) throw new NotFoundException('Pickup address not found');
      if (
        location.ghnSyncStatus === 'CREATING' ||
        location.ghnSyncStatus === 'UNKNOWN'
      )
        throw new ConflictException(
          'Resolve the GHN connection before disconnecting',
        );
      location.ghnShopId = null;
      location.ghnSyncStatus = 'NOT_CONNECTED';
      location.ghnSyncStartedAt = null;
      location.ghnSyncAttempt = null;
      location.ghnReviewedById = null;
      location.ghnReviewReason = null;
      return { location: await manager.save(PickupLocation, location) };
    });
  }

  async connectGhn(shopId: string, input: ConnectGhnShopInput) {
    const provinces = await this.ghn.provinces();
    if (!provinces.some((p) => p.id === input.provinceId))
      throw new BadRequestException('Invalid GHN province');
    const districts = await this.ghn.districts(input.provinceId);
    if (!districts.some((d) => d.id === input.districtId))
      throw new BadRequestException('Invalid GHN district');
    const wards = await this.ghn.wards(input.districtId);
    if (!wards.some((w) => w.id === input.wardCode))
      throw new BadRequestException('Invalid GHN ward');
    const prepared = await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        shopId,
      ]);
      const location = await manager.findOneByOrFail(PickupLocation, {
        shopId,
      });
      if (!['NOT_CONNECTED', 'STALE'].includes(location.ghnSyncStatus))
        throw new ConflictException(
          'GHN connection already exists or requires review',
        );
      const shop = await manager.findOneByOrFail(Shop, { id: shopId });
      const attempt = {
        name: shop.name,
        phone: location.phone,
        address: location.addressLine1,
        districtId: input.districtId,
        wardCode: input.wardCode,
      };
      location.ghnSyncStatus = 'CREATING';
      location.ghnSyncStartedAt = new Date();
      location.ghnSyncAttempt = attempt;
      await manager.save(location);
      return attempt;
    });
    let result: Awaited<ReturnType<GhnShopClient['create']>>;
    try {
      result = await this.ghn.create(prepared);
    } catch {
      result = { status: 'UNKNOWN' };
    }
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        shopId,
      ]);
      const location = await manager.findOneByOrFail(PickupLocation, {
        shopId,
      });
      if (location.ghnSyncStatus !== 'CREATING') {
        if (
          location.ghnSyncStatus === 'CONNECTED' &&
          result.status === 'CREATED' &&
          location.ghnShopId === result.shopId
        )
          return { location };
        location.ghnSyncStatus = 'UNKNOWN';
        return { location: await manager.save(location) };
      }
      if (result.status === 'CREATED') {
        location.ghnShopId = result.shopId;
        location.ghnSyncStatus = 'CONNECTED';
      } else location.ghnSyncStatus = 'UNKNOWN';
      return { location: await manager.save(location) };
    });
  }
  async resolveGhn(
    shopId: string,
    actorId: string,
    ghnShopId: number,
    reason: string,
  ) {
    const remote = await this.ghn.findOwnedShop(ghnShopId);
    if (!remote || remote.status !== 1)
      throw new ConflictException(
        'Active GHN shop was not found under the platform account',
      );
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        shopId,
      ]);
      const location = await manager.findOneByOrFail(PickupLocation, {
        shopId,
      });
      const attempt = location.ghnSyncAttempt;
      if (location.ghnSyncStatus !== 'UNKNOWN' || !attempt)
        throw new ConflictException('No uncertain GHN creation to resolve');
      const normalize = (v: string) =>
        v.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
      if (
        normalize(remote.name) !== normalize(attempt.name) ||
        normalize(remote.phone) !== normalize(attempt.phone) ||
        normalize(remote.address) !== normalize(attempt.address) ||
        remote.district_id !== attempt.districtId ||
        remote.ward_code !== attempt.wardCode
      )
        throw new ConflictException(
          'GHN shop details do not match the original request',
        );
      location.ghnShopId = remote._id;
      location.ghnSyncStatus = 'CONNECTED';
      location.ghnReviewedById = actorId;
      location.ghnReviewReason = reason;
      return { location: await manager.save(location) };
    });
  }
}
