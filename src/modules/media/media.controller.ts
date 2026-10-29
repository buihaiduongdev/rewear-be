import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { MediaService } from './media.service';
import type { ProductMediaView } from './media.service';
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

@ApiTags('Product media')
@Controller('products/:productId/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @Serialize(mediaListSchema)
  findAll(
    @Param('productId', { schema: uuidSchema }) productId: string,
  ): Promise<ProductMediaView[]> {
    return this.mediaService.findAll(productId);
  }

  @Get('manage')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaListSchema)
  findForManagement(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
  ) {
    return this.mediaService.findForManagement(productId, user.id);
  }

  @Patch(':mediaId/metadata')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaSchema)
  updateMetadata(
    @CurrentUser() user: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Param('mediaId', { schema: uuidSchema }) mediaId: string,
    @Body({ schema: updateMediaMetadataSchema })
    input: UpdateMediaMetadataInput,
  ) {
    return this.mediaService.updateMetadata(productId, mediaId, user.id, input);
  }

  @Post('upload-ticket')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaUploadTicketSchema, { status: HttpStatus.CREATED })
  createUploadTicket(
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: createMediaUploadTicketSchema })
    input: CreateMediaUploadTicketInput,
  ) {
    return this.mediaService.createUploadTicket(
      productId,
      currentUser.id,
      input,
    );
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaSchema, { status: HttpStatus.CREATED })
  confirmUpload(
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: confirmMediaUploadSchema }) input: ConfirmMediaUploadInput,
  ): Promise<ProductMediaView> {
    return this.mediaService.confirmUpload(productId, currentUser.id, input);
  }

  @Patch('order')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaListSchema)
  reorder(
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Body({ schema: reorderMediaSchema }) input: ReorderMediaInput,
  ): Promise<ProductMediaView[]> {
    return this.mediaService.reorder(productId, currentUser.id, input);
  }

  @Patch(':mediaId/cover')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaSchema)
  setCover(
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Param('mediaId', { schema: uuidSchema }) mediaId: string,
  ): Promise<ProductMediaView> {
    return this.mediaService.setCover(productId, mediaId, currentUser.id);
  }

  @Delete(':mediaId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() currentUser: User,
    @Param('productId', { schema: uuidSchema }) productId: string,
    @Param('mediaId', { schema: uuidSchema }) mediaId: string,
  ): Promise<void> {
    return this.mediaService.delete(productId, mediaId, currentUser.id);
  }
}
