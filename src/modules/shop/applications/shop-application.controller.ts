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
  adminApplicationViewSchema,
  type ApplicationDecisionInput,
  applicationDecisionSchema,
  applicationDocumentViewSchema,
  applicationDownloadViewSchema,
  applicationPageSchema,
  type ApplicationQueryInput,
  applicationQuerySchema,
  type ApplicationSubmitInput,
  applicationSubmitSchema,
  type ApplicationUploadInput,
  applicationUploadSchema,
  applicationViewSchema,
  type SubmitIdentityRenewalInput,
  submitIdentityRenewalSchema,
} from './schemas/shop-application.schema';
import { ShopApplicationService } from './shop-application.service';

@ApiTags('Shop applications')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class ShopApplicationController {
  constructor(
    private readonly shopApplicationService: ShopApplicationService,
  ) {}

  @Post('shops/:shopId/application')
  @HttpCode(200)
  @Serialize(applicationViewSchema)
  create(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.shopApplicationService.create(user.id, shopId);
  }

  @Post('shops/:shopId/identity-renewals')
  @HttpCode(200)
  @Serialize(applicationViewSchema)
  createRenewal(
    @CurrentUser() user: User,
    @Param('shopId', { schema: uuidSchema }) shopId: string,
  ) {
    return this.shopApplicationService.createRenewal(user.id, shopId);
  }

  @Post('shop-applications/:id/submissions')
  @HttpCode(200)
  @Serialize(applicationViewSchema)
  submit(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: applicationSubmitSchema }) input: ApplicationSubmitInput,
  ) {
    return this.shopApplicationService.submit(user.id, id, input);
  }

  @Post('shop-applications/:id/renewal-submissions')
  @HttpCode(200)
  @Serialize(applicationViewSchema)
  submitRenewal(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: submitIdentityRenewalSchema })
    input: SubmitIdentityRenewalInput,
  ) {
    return this.shopApplicationService.submitRenewal(user.id, id, input);
  }

  @Get('shop-applications/mine')
  @Serialize(applicationPageSchema)
  mine(
    @CurrentUser() user: User,
    @Query({ schema: applicationQuerySchema }) input: ApplicationQueryInput,
  ) {
    return this.shopApplicationService.list(user.id, input);
  }

  @Get('shop-applications/admin')
  @Roles(UserRole.ADMIN)
  @Serialize(applicationPageSchema)
  queue(
    @CurrentUser() user: User,
    @Query({ schema: applicationQuerySchema }) input: ApplicationQueryInput,
  ) {
    return this.shopApplicationService.list(user.id, input, true);
  }

  @Get('shop-applications/admin/:id')
  @Roles(UserRole.ADMIN)
  @Serialize(adminApplicationViewSchema)
  adminDetail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shopApplicationService.detail(user.id, id, true);
  }

  @Post('shop-applications/admin/:id/decisions')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @Serialize(adminApplicationViewSchema)
  decide(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: applicationDecisionSchema })
    input: ApplicationDecisionInput,
  ) {
    return this.shopApplicationService.decide(user.id, id, input);
  }

  @Get('shop-applications/:id')
  @Serialize(applicationViewSchema)
  detail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shopApplicationService.detail(user.id, id);
  }

  @Post('shop-applications/:id/documents')
  @HttpCode(200)
  @Serialize(applicationDocumentViewSchema)
  upload(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: applicationUploadSchema }) input: ApplicationUploadInput,
  ) {
    return this.shopApplicationService.attach(user.id, id, input);
  }

  @Get('shop-application-documents/:id/download')
  @Serialize(applicationDownloadViewSchema)
  download(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.shopApplicationService.download(
      user.id,
      id,
      user.role === UserRole.ADMIN,
    );
  }
}
