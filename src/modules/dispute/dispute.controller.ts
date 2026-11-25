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
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { DisputeAdjudicationService } from './dispute-adjudication.service';
import { DisputeRefundService } from './dispute-refund.service';
import { DisputeService } from './dispute.service';
import { DisputeReturnService } from './returns/return.service';
import type {
  DisputeAppealInput,
  DisputeDecisionInput,
  DisputeReplyInput,
  DisputeUploadInput,
  OpenDisputeIssueInput,
  ReturnCarrierStatusInput,
  ReturnLabelInput,
} from './schemas/dispute.schema';
import {
  disputeAppealInputSchema,
  disputeAppealViewSchema,
  disputeCaseDetailSchema,
  disputeCaseViewSchema,
  disputeDecisionInputSchema,
  disputeDecisionViewSchema,
  disputeDownloadSchema,
  disputeEvidenceViewSchema,
  disputeExtensionSchema,
  disputeIssueViewSchema,
  disputeListSchema,
  disputeMessageViewSchema,
  disputeReplySchema,
  disputeUploadSchema,
  openDisputeIssueSchema,
  returnCarrierStatusSchema,
  returnLabelInputSchema,
  returnViewSchema,
} from './schemas/dispute.schema';
import {
  refundCreditViewSchema,
  refundDetailViewSchema,
} from './schemas/refund-execution.schema';

@ApiTags('Disputes')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class DisputeController {
  constructor(
    private readonly disputes: DisputeService,
    private readonly adjudication: DisputeAdjudicationService,
    private readonly refunds: DisputeRefundService,
    private readonly returns: DisputeReturnService,
  ) {}

  @Post('orders/:id/dispute-evidence')
  @HttpCode(200)
  @Serialize(disputeEvidenceViewSchema)
  upload(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeUploadSchema }) input: DisputeUploadInput,
  ) {
    return this.disputes.attachEvidence(user.id, id, input);
  }

  @Get('dispute-evidence/:id/download')
  @Serialize(disputeDownloadSchema)
  download(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.disputes.downloadEvidence(user.id, id);
  }

  @Get('admin/dispute-evidence/:id/download')
  @Roles(UserRole.ADMIN)
  @Serialize(disputeDownloadSchema)
  adminDownload(@Param('id', { schema: uuidSchema }) id: string) {
    return this.disputes.adminDownloadEvidence(id);
  }

  @Post('orders/:id/dispute/issues')
  @HttpCode(200)
  @Serialize(disputeIssueViewSchema)
  open(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: openDisputeIssueSchema }) input: OpenDisputeIssueInput,
  ) {
    return this.disputes.openIssue(user.id, id, input);
  }

  @Post('dispute-issues/:id/replies')
  @HttpCode(200)
  @Serialize(disputeMessageViewSchema)
  reply(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeReplySchema }) input: DisputeReplyInput,
  ) {
    return this.disputes.reply(user.id, id, input);
  }

  @Get('orders/:id/dispute')
  @Serialize(disputeCaseDetailSchema)
  detail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: disputeListSchema }) input: { offset: number },
  ) {
    return this.disputes.byOrder(user.id, id, input.offset);
  }

  @Get('disputes/mine')
  @Serialize(z.array(disputeCaseViewSchema))
  mine(
    @CurrentUser() user: User,
    @Query({ schema: disputeListSchema }) input: { offset: number },
  ) {
    return this.disputes.buyerList(user.id, input.offset);
  }

  @Get('shops/:shopId/disputes')
  @Serialize(z.array(disputeCaseViewSchema))
  shop(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Query({ schema: disputeListSchema }) input: { offset: number },
  ) {
    return this.disputes.shopList(user.id, shopId, input.offset);
  }

  @Get('admin/disputes')
  @Roles(UserRole.ADMIN)
  @Serialize(z.array(disputeCaseViewSchema))
  adminList(@Query({ schema: disputeListSchema }) input: { offset: number }) {
    return this.disputes.adminList(input.offset);
  }

  @Get('admin/disputes/:id')
  @Roles(UserRole.ADMIN)
  @Serialize(disputeCaseDetailSchema)
  adminDetail(
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: disputeListSchema }) input: { offset: number },
  ) {
    return this.disputes.adminDetail(id, input.offset);
  }

  @Post('admin/dispute-issues/:id/extend')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(disputeIssueViewSchema)
  extend(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeExtensionSchema }) input: { reason: string },
  ) {
    return this.adjudication.extend(user.id, id, input);
  }

  @Post('admin/dispute-issues/:id/decision')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(disputeDecisionViewSchema)
  decide(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeDecisionInputSchema }) input: DisputeDecisionInput,
  ) {
    return this.adjudication.decide(user.id, id, input);
  }

  @Post('dispute-decisions/:id/appeals')
  @HttpCode(200)
  @Serialize(disputeAppealViewSchema)
  submitAppeal(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeAppealInputSchema }) input: DisputeAppealInput,
  ) {
    return this.adjudication.submitAppeal(user.id, id, input);
  }

  @Post('admin/dispute-decisions/:id/appeal-decision')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(disputeDecisionViewSchema)
  concludeAppeal(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeDecisionInputSchema }) input: DisputeDecisionInput,
  ) {
    return this.adjudication.concludeAppeal(user.id, id, input);
  }

  @Get('dispute-decisions/:id/refund')
  @Serialize(refundDetailViewSchema)
  refundView(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.refunds.view(user.id, id, user.role === UserRole.ADMIN);
  }

  @Post('admin/dispute-decisions/:id/refund')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(refundCreditViewSchema.nullable())
  executeRefund(@Param('id', { schema: uuidSchema }) id: string) {
    return this.refunds.execute(id);
  }

  @Get('dispute-returns/:id')
  @Serialize(returnViewSchema)
  readReturn(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.returns.read(user.id, id, user.role === UserRole.ADMIN);
  }

  @Post('admin/dispute-returns/:id/label')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(returnViewSchema)
  createReturnLabel(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnLabelInputSchema }) input: ReturnLabelInput,
  ) {
    return this.returns.createLabel(user.id, id, input);
  }

  @Post('dispute-returns/:id/handover')
  @HttpCode(200)
  @Serialize(returnViewSchema)
  handoverReturn(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.returns.recordHandover(user.id, id);
  }

  @Post('admin/dispute-returns/:id/status')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(returnViewSchema)
  updateReturnStatus(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnCarrierStatusSchema })
    input: ReturnCarrierStatusInput,
  ) {
    return this.returns.updateCarrierStatus(user.id, id, input);
  }

  @Post('dispute-returns/:id/confirm-receipt')
  @HttpCode(200)
  @Serialize(returnViewSchema)
  confirmReturnReceipt(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.returns.confirmReceipt(user.id, id);
  }
}
