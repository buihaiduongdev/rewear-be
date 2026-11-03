import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { AdministrativeDivisionService } from '@/modules/administrative-division/administrative-division.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopMemberStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';

import { PickupLocation } from './entities/pickup-location.entity';
import type { SavePickupLocationInput } from './schemas/pickup-location.schema';

@Injectable()
export class PickupLocationService {
  constructor(
    private readonly db: DataSource,
    private readonly divisions: AdministrativeDivisionService,
  ) {}

  async read(userId: string, shopId?: string) {
    return this.db.transaction(async (manager) => {
      if (shopId) await this.lockShopOwner(manager, shopId, userId);
      const location = await manager.findOneBy(
        PickupLocation,
        shopId ? { shopId } : { userId },
      );
      return { location };
    });
  }

  async save(userId: string, input: SavePickupLocationInput, shopId?: string) {
    return this.db.transaction(async (manager) => {
      // Serialize create/update by the source row, including concurrent first saves.
      // Shop ownership remains locked until commit so access cannot change mid-save.
      if (shopId) await this.lockShopOwner(manager, shopId, userId);
      else {
        const user = await manager.findOne(User, {
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('User not found');
      }
      const address = this.divisions.resolveAddress(
        input.provinceCode,
        input.wardCode,
      );
      const existing = await manager.findOneBy(
        PickupLocation,
        shopId ? { shopId } : { userId },
      );
      const location =
        existing ??
        manager.create(PickupLocation, {
          userId: shopId ? null : userId,
          shopId: shopId ?? null,
        });
      Object.assign(location, input, address, { countryCode: 'VN' });
      return { location: await manager.save(PickupLocation, location) };
    });
  }

  private async lockShopOwner(
    manager: EntityManager,
    shopId: string,
    userId: string,
  ) {
    const shop = await manager.findOne(Shop, {
      where: { id: shopId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!shop) throw new NotFoundException('Shop not found');
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
