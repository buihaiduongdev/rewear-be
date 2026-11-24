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

import { DisputeEvidenceService } from './dispute-evidence.service';
import { DisputeReadService } from './dispute-read.service';
import { DisputeReviewService } from './dispute-review.service';
import { DisputeService } from './dispute.service';
import {
  disputeCaseDetailSchema,
  disputeCaseViewSchema,
  disputeDownloadSchema,
  disputeEvidenceViewSchema,
  disputeIssueViewSchema,
  disputeMessageViewSchema,
} from './schemas/dispute-view.schema';
import {
  disputeExtensionSchema,
  disputeListSchema,
  disputeReplySchema,
  disputeSupplementSchema,
  disputeUploadSchema,
  openDisputeIssueSchema,
} from './schemas/dispute.schema';
import type {
  DisputeReplyInput,
  DisputeSupplementInput,
  DisputeUploadInput,
  OpenDisputeIssueInput,
} from './types/dispute.type';

@ApiTags('Disputes')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class DisputeController {
  constructor(
    private readonly disputes: DisputeService,
    private readonly reads: DisputeReadService,
    private readonly review: DisputeReviewService,
    private readonly evidence: DisputeEvidenceService,
  ) {}

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

  @Post('dispute-issues/:id/evidence')
  @HttpCode(200)
  @Serialize(disputeIssueViewSchema)
  supplement(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeSupplementSchema }) input: DisputeSupplementInput,
  ) {
    return this.disputes.supplement(user.id, id, input);
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
    return this.reads.byOrder(user.id, id, input.offset);
  }

  @Get('disputes/mine')
  @Serialize(z.array(disputeCaseViewSchema))
  mine(
    @CurrentUser() user: User,
    @Query({ schema: disputeListSchema }) input: { offset: number },
  ) {
    return this.reads.buyerList(user.id, input.offset);
  }

  @Get('shops/:shopId/disputes')
  @Serialize(z.array(disputeCaseViewSchema))
  shop(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Query({ schema: disputeListSchema }) input: { offset: number },
  ) {
    return this.reads.shopList(user.id, shopId, input.offset);
  }

  @Get('admin/disputes')
  @Roles(UserRole.ADMIN)
  @Serialize(z.array(disputeCaseViewSchema))
  adminList(@Query({ schema: disputeListSchema }) input: { offset: number }) {
    return this.reads.adminList(input.offset);
  }

  @Get('admin/disputes/:id')
  @Roles(UserRole.ADMIN)
  @Serialize(disputeCaseDetailSchema)
  adminDetail(
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: disputeListSchema }) input: { offset: number },
  ) {
    return this.reads.adminDetail(id, input.offset);
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
    return this.review.extend(user.id, id, input);
  }

  @Post('orders/:id/dispute-evidence')
  @HttpCode(200)
  @Serialize(disputeEvidenceViewSchema)
  upload(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: disputeUploadSchema }) input: DisputeUploadInput,
  ) {
    return this.evidence.attach(user.id, id, input);
  }

  @Get('dispute-evidence/:id/download')
  @Serialize(disputeDownloadSchema)
  download(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.evidence.download(user.id, id);
  }

  @Get('admin/dispute-evidence/:id/download')
  @Roles(UserRole.ADMIN)
  @Serialize(disputeDownloadSchema)
  adminDownload(@Param('id', { schema: uuidSchema }) id: string) {
    return this.evidence.adminDownload(id);
  }
}
