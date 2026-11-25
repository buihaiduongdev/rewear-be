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

import { ReportMediaService } from './report-media.service';
import {
  adminReportPageSchema,
  adminReportViewSchema,
  type ClaimReportInput,
  claimReportSchema,
  type CreateReportInput,
  createReportSchema,
  reportDownloadSchema,
  reportEvidenceViewSchema,
  reportPageSchema,
  type ReportQuery,
  reportQuerySchema,
  type ReportSupplementInput,
  reportSupplementSchema,
  reportUploadSchema,
  reportViewSchema,
  type ResolveReportInput,
  resolveReportSchema,
} from './schemas/report.schema';
import { ViolationReportService } from './violation-report.service';

@ApiTags('Violation reports')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('reports')
export class ReportController {
  constructor(
    private readonly reports: ViolationReportService,
    private readonly media: ReportMediaService,
  ) {}

  @Post()
  @HttpCode(200)
  @Serialize(reportViewSchema)
  create(
    @CurrentUser() user: User,
    @Body({ schema: createReportSchema }) input: CreateReportInput,
  ) {
    return this.reports.create(user.id, input);
  }

  @Get('mine')
  @Serialize(reportPageSchema)
  mine(
    @CurrentUser() user: User,
    @Query({ schema: reportQuerySchema }) input: ReportQuery,
  ) {
    return this.reports.list(user.id, input);
  }

  @Post('evidence')
  @HttpCode(200)
  @Serialize(reportEvidenceViewSchema)
  upload(
    @CurrentUser() user: User,
    @Body({ schema: reportUploadSchema })
    input: z.input<typeof reportUploadSchema>,
  ) {
    return this.media.attach(user.id, input);
  }

  @Get('evidence/:id/download')
  @Serialize(reportDownloadSchema)
  download(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.media.download(user.id, id);
  }

  @Get('admin')
  @Roles(UserRole.ADMIN)
  @Serialize(adminReportPageSchema)
  queue(
    @CurrentUser() user: User,
    @Query({ schema: reportQuerySchema }) input: ReportQuery,
  ) {
    return this.reports.list(user.id, input, true);
  }

  @Get('admin/:id')
  @Roles(UserRole.ADMIN)
  @Serialize(adminReportViewSchema)
  adminDetail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.reports.adminDetail(user.id, id);
  }

  @Post('admin/:id/claim')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(adminReportViewSchema)
  claim(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: claimReportSchema }) input: ClaimReportInput,
  ) {
    return this.reports.claim(user.id, id, input);
  }

  @Post('admin/:id/resolve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(adminReportViewSchema)
  resolve(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: resolveReportSchema }) input: ResolveReportInput,
  ) {
    return this.reports.resolve(user.id, id, input);
  }

  @Get(':id')
  @Serialize(reportViewSchema)
  detail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.reports.mineDetail(user.id, id);
  }

  @Post(':id/supplements')
  @HttpCode(200)
  @Serialize(reportViewSchema)
  supplement(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: reportSupplementSchema }) input: ReportSupplementInput,
  ) {
    return this.reports.supplement(user.id, id, input);
  }
}
