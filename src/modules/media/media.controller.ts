import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentShopId, CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { RequirePermission } from '@/modules/authorization/decorators/permission.decorator';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';
import { User } from '@/modules/user/entities';

import { MediaService } from './media.service';
import {
  mediaListSchema,
  mediaSchema,
  mediaUploadTicketSchema,
} from './schemas';
import {
  confirmMediaUploadSchema,
  createMediaUploadTicketSchema,
  reorderMediaSchema,
  updateMediaMetadataSchema,
} from './schemas/media-input.schema';
import type {
  ConfirmMediaUploadInput,
  CreateMediaUploadTicketInput,
  ReorderMediaInput,
  UpdateMediaMetadataInput,
} from './schemas/media-input.schema';
import type { ProductMediaView } from './types/product-media.type';

@ApiTags('Product media')
@Controller('products/:productId/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @PublicAccess()
  @Get()
  @Serialize(mediaListSchema)
  findAll(
    @Param('productId', { schema: uuidSchema }) productId: string,
  ): Promise<ProductMediaView[]> {
    return this.mediaService.findAll(productId);
  }

  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_VIEW)
  @Get('manage')
  @ApiBearerAuth()
  @Serialize(mediaListSchema)
  findForManagement(
    @CurrentShopId() shopId: string | undefined,
    @Param('productId', { schema: uuidSchema }) productId: string,
  ) {
    return this.mediaService.findForManagement(productId, shopId);
  }

  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Patch(':mediaId/metadata')
  @ApiBearerAuth()
  @Serialize(mediaSchema)
  updateMetadata(
    @CurrentShopId() shopId: string | undefined,
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Param('mediaId', { schema: uuidSchema }) mediaId: string,
    @Body({ schema: updateMediaMetadataSchema })
    input: UpdateMediaMetadataInput,
  ) {
    return this.mediaService.updateMetadata(
      productId,
      mediaId,
      user.id,
      input,
      shopId,
    );
  }

  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Post('upload-ticket')
  @ApiBearerAuth()
  @Serialize(mediaUploadTicketSchema, { status: HttpStatus.CREATED })
  createUploadTicket(
    @CurrentShopId() shopId: string | undefined,
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: createMediaUploadTicketSchema })
    input: CreateMediaUploadTicketInput,
  ) {
    return this.mediaService.createUploadTicket(
      productId,
      currentUser.id,
      input,
      shopId,
    );
  }

  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Post()
  @ApiBearerAuth()
  @Serialize(mediaSchema, { status: HttpStatus.CREATED })
  confirmUpload(
    @CurrentShopId() shopId: string | undefined,
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: confirmMediaUploadSchema }) input: ConfirmMediaUploadInput,
  ): Promise<ProductMediaView> {
    return this.mediaService.confirmUpload(
      productId,
      currentUser.id,
      input,
      shopId,
    );
  }

  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Patch('order')
  @ApiBearerAuth()
  @Serialize(mediaListSchema)
  reorder(
    @CurrentShopId() shopId: string | undefined,
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: reorderMediaSchema }) input: ReorderMediaInput,
  ): Promise<ProductMediaView[]> {
    return this.mediaService.reorder(productId, currentUser.id, input, shopId);
  }

  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Patch(':mediaId/cover')
  @ApiBearerAuth()
  @Serialize(mediaSchema)
  setCover(
    @CurrentShopId() shopId: string | undefined,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Param('mediaId', { schema: uuidSchema }) mediaId: string,
  ): Promise<ProductMediaView> {
    return this.mediaService.setCover(productId, mediaId, shopId);
  }

  @RequirePermission(SHOP_PERMISSIONS.PRODUCT_UPDATE)
  @Delete(':mediaId')
  @ApiBearerAuth()
  @Serialize(mediaListSchema)
  delete(
    @CurrentShopId() shopId: string | undefined,
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Param('mediaId', { schema: uuidSchema }) mediaId: string,
  ): Promise<ProductMediaView[]> {
    return this.mediaService.delete(productId, mediaId, currentUser.id, shopId);
  }
}
