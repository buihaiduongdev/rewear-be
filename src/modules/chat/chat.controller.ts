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

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { ChatService } from './chat.service';
import {
  chatConversationPageSchema,
  chatConversationViewSchema,
  chatDownloadSchema,
  chatMessagePageSchema,
  chatMessageViewSchema,
  chatOpenViewSchema,
  type ChatPageInput,
  chatPageSchema,
  openChatSchema,
  type SendChatInput,
  sendChatSchema,
} from './schemas/chat.schema';

@ApiTags('Buyer–Shop chat')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  @HttpCode(200)
  @Serialize(chatOpenViewSchema)
  open(
    @CurrentUser() user: User,
    @Body({ schema: openChatSchema }) input: { shopId: string },
  ) {
    return this.chatService.open(user.id, input.shopId);
  }

  @Get('conversations')
  @Serialize(chatConversationPageSchema)
  list(
    @CurrentUser() user: User,
    @Query({ schema: chatPageSchema }) input: ChatPageInput,
  ) {
    return this.chatService.list(user.id, input);
  }

  @Get('conversations/:id')
  @Serialize(chatConversationViewSchema)
  detail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.chatService.detail(user.id, id);
  }

  @Get('conversations/:id/messages')
  @Serialize(chatMessagePageSchema)
  messages(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: chatPageSchema }) input: ChatPageInput,
  ) {
    return this.chatService.messages(user.id, id, input);
  }

  @Post('conversations/:id/messages')
  @HttpCode(200)
  @Serialize(chatMessageViewSchema)
  send(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: sendChatSchema }) input: SendChatInput,
  ) {
    return this.chatService.send(user.id, id, input);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  @Serialize(chatConversationViewSchema)
  read(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.chatService.read(user.id, id);
  }

  @Get('media/:id/download')
  @Serialize(chatDownloadSchema)
  download(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.chatService.download(user.id, id);
  }
}
