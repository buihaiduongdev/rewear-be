import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';
import { acceptOrderSchema } from '@/modules/order/order.schema';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { CodReconciliationService } from './cod-reconciliation.service';
import {
  adminCollectionViewSchema,
  adminReconciliationDetailSchema,
  collectionInputSchema,
  financeHistorySchema,
  financeListSchema,
  remittanceInputSchema,
  remittanceViewSchema,
} from './schemas/cod-reconciliation.schema';
import type {
  CollectionInput,
  FinanceListInput,
  RemittanceInput,
} from './schemas/cod-reconciliation.schema';

@ApiTags('COD reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class CodReconciliationController {
  constructor(private readonly reconciliation: CodReconciliationService) {}
  @Post('orders/:id/cod/collection')
  @HttpCode(200)
  @Serialize(adminCollectionViewSchema)
  collect(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: collectionInputSchema }) input: CollectionInput,
  ) {
    return this.reconciliation.recordCollection(user.id, id, input);
  }
  @Post('cod/remittances')
  @HttpCode(200)
  @Serialize(remittanceViewSchema)
  remit(
    @CurrentUser() user: User,
    @Body({ schema: remittanceInputSchema }) input: RemittanceInput,
  ) {
    return this.reconciliation.recordRemittance(user.id, input);
  }
  @Get('cod/reconciliations')
  @Serialize(z.array(adminCollectionViewSchema))
  list(@Query({ schema: financeListSchema }) input: FinanceListInput) {
    return this.reconciliation.list(input);
  }
  @Get('orders/:id/cod/reconciliation')
  @Serialize(adminReconciliationDetailSchema)
  detail(
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: financeHistorySchema })
    input: Pick<FinanceListInput, 'offset'>,
  ) {
    return this.reconciliation.detail(id, input);
  }
  @Post('orders/:id/cod/reconciliation/refresh')
  @HttpCode(200)
  @Serialize(adminCollectionViewSchema)
  refresh(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.reconciliation.refresh(user.id, id);
  }
}
