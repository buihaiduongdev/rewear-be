import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { acceptOrderSchema } from '@/modules/order/schemas/order.schema';
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
} from './types/cod-reconciliation.type';

@ApiTags('COD reconciliation')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class CodReconciliationController {
  constructor(
    private readonly codReconciliationService: CodReconciliationService,
  ) {}
  @AuthenticatedAccess()
  @Post('orders/:id/cod/collection')
  @HttpCode(200)
  @Serialize(adminCollectionViewSchema)
  collect(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: collectionInputSchema }) input: CollectionInput,
  ) {
    return this.codReconciliationService.recordCollection(user.id, id, input);
  }
  @AuthenticatedAccess()
  @Post('cod/remittances')
  @HttpCode(200)
  @Serialize(remittanceViewSchema)
  remit(
    @CurrentUser() user: User,
    @Body({ schema: remittanceInputSchema }) input: RemittanceInput,
  ) {
    return this.codReconciliationService.recordRemittance(user.id, input);
  }
  @AuthenticatedAccess()
  @Get('cod/reconciliations')
  @Serialize(z.array(adminCollectionViewSchema))
  list(@Query({ schema: financeListSchema }) input: FinanceListInput) {
    return this.codReconciliationService.list(input);
  }
  @AuthenticatedAccess()
  @Get('orders/:id/cod/reconciliation')
  @Serialize(adminReconciliationDetailSchema)
  detail(
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: financeHistorySchema })
    input: Pick<FinanceListInput, 'offset'>,
  ) {
    return this.codReconciliationService.detail(id, input);
  }
  @AuthenticatedAccess()
  @Post('orders/:id/cod/reconciliation/refresh')
  @HttpCode(200)
  @Serialize(adminCollectionViewSchema)
  refresh(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: acceptOrderSchema }) _input: Record<string, never>,
  ) {
    return this.codReconciliationService.refresh(user.id, id);
  }
}
