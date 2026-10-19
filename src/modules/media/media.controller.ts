import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import {
  ConfirmMediaUploadDto,
  CreateMediaUploadTicketDto,
  ReorderMediaDto,
} from './dto';
import { MediaService } from './media.service';
import type { ProductMediaView } from './media.service';
import {
  mediaListSchema,
  mediaSchema,
  mediaUploadTicketSchema,
} from './schemas';

@ApiTags('Product media')
@Controller('products/:productId/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @Serialize(mediaListSchema)
  findAll(
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductMediaView[]> {
    return this.mediaService.findAll(productId);
  }

  @Post('upload-ticket')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaUploadTicketSchema, { status: HttpStatus.CREATED })
  createUploadTicket(
    @CurrentUser() currentUser: User,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: CreateMediaUploadTicketDto,
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
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: ConfirmMediaUploadDto,
  ): Promise<ProductMediaView> {
    return this.mediaService.confirmUpload(productId, currentUser.id, input);
  }

  @Patch('order')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaListSchema)
  reorder(
    @CurrentUser() currentUser: User,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: ReorderMediaDto,
  ): Promise<ProductMediaView[]> {
    return this.mediaService.reorder(productId, currentUser.id, input);
  }

  @Patch(':mediaId/cover')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Serialize(mediaSchema)
  setCover(
    @CurrentUser() currentUser: User,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<ProductMediaView> {
    return this.mediaService.setCover(productId, mediaId, currentUser.id);
  }

  @Delete(':mediaId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() currentUser: User,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<void> {
    return this.mediaService.delete(productId, mediaId, currentUser.id);
  }
}
