import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { DataSource } from 'typeorm';
import z from 'zod';

import { CurrentUser } from '@/common/decorators';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

import { CoinRewardAdjustmentNotice } from './entities/coin-reward.entity';

const noticeQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@ApiTags('coins')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('coins/reward-notices')
export class CoinRewardController {
  constructor(private readonly db: DataSource) {}

  @Get()
  async mine(
    @CurrentUser() actor: User,
    @Query({ schema: noticeQuerySchema })
    query: z.infer<typeof noticeQuerySchema>,
  ) {
    const user = await this.db.manager.findOneBy(User, {
      id: actor.id,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active buyer required');
    return this.db.manager.find(CoinRewardAdjustmentNotice, {
      where: { buyerId: user.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });
  }
}
