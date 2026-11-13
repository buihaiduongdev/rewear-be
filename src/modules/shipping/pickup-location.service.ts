import { ForbiddenException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopMemberStatus } from '@/modules/shop/enums';

import { PickupLocation } from './entities/pickup-location.entity';
import type { SavePickupLocationInput } from './schemas/pickup-location.schema';

@Injectable()
export class PickupLocationService {
  constructor(
    private readonly db: DataSource,
    private readonly divisions: AdministrativeDivisionService,
  ) {}

  async read(userId: string, shopId: string) {
    return this.db.transaction(async (manager) => {
      await this.lockShopOwner(manager, shopId, userId);
      const location = await manager.findOneBy(PickupLocation, { shopId });
      return { location };
    });
  }

  async save(userId: string, input: SavePickupLocationInput, shopId: string) {
    return this.db.transaction(async (manager) => {
      // Serialize create/update by the source row, including concurrent first saves.
      // Shop ownership remains locked until commit so access cannot change mid-save.
      await this.lockShopOwner(manager, shopId, userId);
      const address = this.divisions.resolveAddress(
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

  private async lockShopOwner(
    manager: EntityManager,
    shopId: string,
    userId: string,
  ) {
    await manager.findOneOrFail(Shop, {
      where: { id: shopId },
      lock: { mode: 'pessimistic_write' },
    });
    const owner = await manager.findOne(ShopMember, {
      where: {
        shopId,
        userId,
        memberRole: ShopMemberRole.OWNER,
        status: ShopMemberStatus.ACTIVE,
      },
      lock: { mode: 'pessimistic_read' },
    });
    if (!owner) throw new ForbiddenException('Shop owner access required');
  }
}
