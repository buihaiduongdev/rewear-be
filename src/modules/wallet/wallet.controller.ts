import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Serialize } from '@/common/decorators';
import { dateTimeSchema } from '@/common/schemas';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { WalletService } from './wallet.service';

const walletQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
const walletViewSchema = z.object({
  balance: z.number().int().nonnegative(),
  currency: z.literal('VND'),
  credits: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      amount: z.number().int().positive(),
      reason: z.literal('ORDER_CANCELLED'),
      createdAt: dateTimeSchema,
    }),
  ),
});

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get('mine')
  @Serialize(walletViewSchema)
  mine(
    @CurrentUser() user: User,
    @Query({ schema: walletQuerySchema })
    input: { limit?: number; offset?: number },
  ) {
    return this.wallet.mine(user.id, input);
  }
}
