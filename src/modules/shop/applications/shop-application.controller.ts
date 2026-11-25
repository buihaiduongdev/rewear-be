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

import { OwnerIdentityRenewalService } from './renewal/owner-identity-renewal.service';
import {
  adminApplicationViewSchema,
  applicationCreateSchema,
  applicationDecisionSchema,
  applicationDocumentViewSchema,
  applicationDownloadViewSchema,
  applicationPageSchema,
  applicationQuerySchema,
  applicationSubmitSchema,
  applicationUploadSchema,
  applicationViewSchema,
  createIdentityRenewalSchema,
  submitIdentityRenewalSchema,
} from './schemas/shop-application.schema';
import { ShopApplicationAdminService } from './shop-application-admin.service';
import { ShopApplicationMediaService } from './shop-application-media.service';
import { ShopApplicationReadService } from './shop-application-read.service';
import { ShopApplicationService } from './shop-application.service';

@ApiTags('Shop applications')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class ShopApplicationController {
  constructor(
    private readonly renewals: OwnerIdentityRenewalService,
    private readonly applications: ShopApplicationService,
    private readonly read: ShopApplicationReadService,
    private readonly admins: ShopApplicationAdminService,
    private readonly media: ShopApplicationMediaService,
  ) {}
  @Post('shops/:shopId/identity-renewals')
  @HttpCode(200)
  @Serialize(applicationViewSchema)
  createRenewal(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: createIdentityRenewalSchema })
    input: z.input<typeof createIdentityRenewalSchema>,
  ) {
    return this.renewals.create(user.id, shopId, input);
  }
  @Post('shop-applications/:id/renewal-submissions')
  @HttpCode(200)
  @Serialize(applicationViewSchema)
  submitRenewal(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: submitIdentityRenewalSchema })
    input: z.input<typeof submitIdentityRenewalSchema>,
  ) {
    return this.renewals.submit(user.id, id, input);
  }
  @Post('shops/:shopId/application')
  @HttpCode(200)
  @Serialize(applicationViewSchema)
  create(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
    @Body({ schema: applicationCreateSchema })
    input: z.input<typeof applicationCreateSchema>,
  ) {
    return this.applications.create(user.id, shopId, input);
  }
  @Get('shop-applications/mine')
  @Serialize(applicationPageSchema)
  mine(
    @CurrentUser() user: User,
    @Query({ schema: applicationQuerySchema })
    input: z.input<typeof applicationQuerySchema>,
  ) {
    return this.read.list(user.id, input);
  }
  @Get('shop-applications/admin')
  @Roles(UserRole.ADMIN)
  @Serialize(applicationPageSchema)
  queue(
    @CurrentUser() user: User,
    @Query({ schema: applicationQuerySchema })
    input: z.input<typeof applicationQuerySchema>,
  ) {
    return this.read.list(user.id, input, true);
  }
  @Get('shop-applications/admin/:id')
  @Roles(UserRole.ADMIN)
  @Serialize(adminApplicationViewSchema)
  adminDetail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.read.detail(user.id, id, true);
  }
  @Post('shop-applications/admin/:id/decisions')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(adminApplicationViewSchema)
  decide(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: applicationDecisionSchema })
    input: z.input<typeof applicationDecisionSchema>,
  ) {
    return this.admins.decide(user.id, id, input);
  }
  @Get('shop-applications/:id')
  @Serialize(applicationViewSchema)
  detail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.applications.find(user.id, id);
  }
  @Post('shop-applications/:id/submissions')
  @HttpCode(200)
  @Serialize(applicationViewSchema)
  submit(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: applicationSubmitSchema })
    input: z.input<typeof applicationSubmitSchema>,
  ) {
    return this.applications.submit(user.id, id, input);
  }
  @Post('shop-applications/:id/documents')
  @HttpCode(200)
  @Serialize(applicationDocumentViewSchema)
  upload(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: applicationUploadSchema })
    input: z.input<typeof applicationUploadSchema>,
  ) {
    return this.media.attach(user.id, id, input);
  }
  @Get('shop-application-documents/:id/download')
  @Serialize(applicationDownloadViewSchema)
  download(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.media.download(user.id, id);
  }
}
