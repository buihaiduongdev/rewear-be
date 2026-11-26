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

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import {
  adminReportPageSchema,
  adminReportViewSchema,
  type CreateReportInput,
  createReportSchema,
  reportDownloadSchema,
  reportPageSchema,
  type ReportQuery,
  reportQuerySchema,
  type ReportSupplementInput,
  reportSupplementSchema,
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
  constructor(private readonly reports: ViolationReportService) {}

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

  @Get('evidence/:id/download')
  @Serialize(reportDownloadSchema)
  download(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.reports.downloadEvidence(user.id, id);
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
  ) {
    return this.reports.claim(user.id, id);
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
