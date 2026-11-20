import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { z } from 'zod';

import { CurrentUser } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { CoinCodReleaseService } from '../core/coin-cod-release.service';
import { CoinProgramApiService } from './coin-program-api.service';
import { coinCodReleaseSchema } from './schemas/coin-program.schema';
import {
  coinProgramBudgetSchema,
  coinProgramCorrectionSchema,
  coinProgramReasonSchema,
  createCoinProgramSchema,
  issueCoinProgramSchema,
} from './schemas/coin-program.schema';

@ApiBearerAuth()
@ApiTags('coins')
@AuthenticatedAccess()
@Controller('coins')
export class CoinProgramController {
  constructor(
    private readonly api: CoinProgramApiService,
    private readonly codRelease: CoinCodReleaseService,
  ) {}
  @Post('admin/orders/:id/release')
  release(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: coinCodReleaseSchema })
    input: z.infer<typeof coinCodReleaseSchema>,
  ) {
    return this.codRelease.release(user.id, id, input);
  }
  @Get('balance')
  balance(@CurrentUser() user: User) {
    return this.api.balance(user.id);
  }
  @Get('history')
  history(@CurrentUser() user: User) {
    return this.api.buyerHistory(user.id);
  }
  @Get('admin/programs')
  programs(@CurrentUser() user: User) {
    return this.api.list(user.id);
  }
  @Get('admin/programs/:id/report')
  report(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.api.report(user.id, id);
  }
  @Get('admin/programs/:id/history')
  programHistory(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.api.history(user.id, id);
  }
  @Post('admin/programs')
  create(
    @CurrentUser() user: User,
    @Body({ schema: createCoinProgramSchema })
    input: z.infer<typeof createCoinProgramSchema>,
  ) {
    return this.api.create(user.id, {
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
  }
  @Post('admin/programs/:id/activate')
  activate(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: coinProgramReasonSchema })
    input: z.infer<typeof coinProgramReasonSchema>,
  ) {
    return this.api.activate(user.id, id, input.reason);
  }
  @Post('admin/programs/:id/stop')
  stop(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: coinProgramReasonSchema })
    input: z.infer<typeof coinProgramReasonSchema>,
  ) {
    return this.api.stop(user.id, id, input.reason);
  }
  @Post('admin/programs/:id/budget')
  budget(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: coinProgramBudgetSchema })
    input: z.infer<typeof coinProgramBudgetSchema>,
  ) {
    return this.api.budget(user.id, id, input.budget, input.reason);
  }
  @Post('admin/programs/:id/grants')
  issue(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: issueCoinProgramSchema })
    input: z.infer<typeof issueCoinProgramSchema>,
  ) {
    return this.api.issue(
      user.id,
      id,
      input.requestId,
      input.recipients,
      input.reason,
    );
  }
  @Post('admin/grants/:id/correction')
  correct(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: coinProgramCorrectionSchema })
    input: z.infer<typeof coinProgramCorrectionSchema>,
  ) {
    return this.api.correct(user.id, id, input.amount, input.evidence);
  }
}
