import { Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';

import { PickupLocation } from './entities/pickup-location.entity';
import type { SavePickupLocationInput } from './schemas/pickup-location.schema';

@Injectable()
export class PickupLocationService {
  constructor(
    private readonly db: DataSource,
    private readonly administrativeDivisionService: AdministrativeDivisionService,
  ) {}

  async read(shopId: string) {
    const location = await this.db
      .getRepository(PickupLocation)
      .findOneBy({ shopId });
    return { location };
  }

  async save(userId: string, input: SavePickupLocationInput, shopId: string) {
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const address = this.administrativeDivisionService.resolveAddress(
        input.provinceCode,
        input.wardCode,
      );
      const existing = await manager.findOneBy(PickupLocation, { shopId });
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
}
