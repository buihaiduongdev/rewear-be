import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

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

  private lockShop(manager: EntityManager, shopId: string) {
    return manager.findOne(Shop, {
      where: { id: shopId },
      lock: { mode: 'pessimistic_write' },
    });
  }

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
    const address = await this.administrativeDivisionService.resolveAddress(
      input.provinceId,
      input.districtId,
      input.wardCode,
    );
    return this.db.transaction(async (manager) => {
      await this.lockShop(manager, shopId);
      const existing = await manager.findOne(PickupLocation, {
        where: { shopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing?.ghnSyncStatus === 'CREATING')
        throw new ConflictException('GHN connection is in progress');
      const changed =
        existing &&
        [
          'contactName',
          'phone',
          'addressLine1',
          'provinceId',
          'districtId',
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
    return this.administrativeDivisionService.findAllProvinces();
  }
  async ghnDistricts(provinceId: number) {
    return this.administrativeDivisionService.findDistrictsByProvinceId(
      provinceId,
    );
  }
  async ghnWards(districtId: number) {
    return this.administrativeDivisionService.findWardsByDistrictId(districtId);
  }

  async disconnectGhn(shopId: string) {
    return this.db.transaction(async (manager) => {
      await this.lockShop(manager, shopId);
      const location = await manager.findOne(PickupLocation, {
        where: { shopId },
        lock: { mode: 'pessimistic_write' },
      });
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

  async connectGhn(shopId: string, input?: ConnectGhnShopInput) {
    const prepared = await this.db.transaction(async (manager) => {
      const shop = await manager.findOneOrFail(Shop, {
        where: { id: shopId },
        lock: { mode: 'pessimistic_write' },
      });
      const location = await manager.findOneOrFail(PickupLocation, {
        where: { shopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!['NOT_CONNECTED', 'STALE'].includes(location.ghnSyncStatus))
        throw new ConflictException(
          'GHN connection already exists or requires review',
        );
      const districtId = input?.districtId ?? location.districtId;
      const wardCode = input?.wardCode ?? location.wardCode;
      if (!districtId || !wardCode) {
        throw new BadRequestException('Pickup address is incomplete');
      }
      const attempt = {
        name: shop.name,
        phone: location.phone,
        address: location.addressLine1,
        districtId,
        wardCode,
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
      await this.lockShop(manager, shopId);
      const location = await manager.findOneOrFail(PickupLocation, {
        where: { shopId },
        lock: { mode: 'pessimistic_write' },
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
      await this.lockShop(manager, shopId);
      const location = await manager.findOneOrFail(PickupLocation, {
        where: { shopId },
        lock: { mode: 'pessimistic_write' },
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
