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

import { CurrentUser, Serialize } from '@/common/decorators';
import { dateTimeSchema } from '@/common/schemas/date-time.schema';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { DISPUTE_EVIDENCE_TAG } from '@/modules/dispute/constants/dispute.constant';
import { User } from '@/modules/user/entities';

import { ChatService } from './chat.service';
import { ChatEvidenceService } from './media/chat-evidence.service';
import { ChatMediaService } from './media/chat-media.service';
import {
  chatConversationPageSchema,
  chatConversationViewSchema,
  chatDownloadSchema,
  chatListSchema,
  chatMediaViewSchema,
  chatMessagePageSchema,
  chatMessageViewSchema,
  chatPageSchema,
  chatReadSchema,
  chatUploadSchema,
  chatUploadTicketSchema,
  openChatSchema,
  sendChatSchema,
} from './schemas/chat.schema';
import type { ChatPageInput, SendChatInput } from './types/chat.type';

const importEvidenceSchema = z.strictObject({
  orderId: z.uuid(),
  tags: z
    .array(z.enum(DISPUTE_EVIDENCE_TAG))
    .min(1)
    .max(7)
    .refine(
      (tags) => new Set(tags).size === tags.length,
      'Duplicate evidence tags',
    ),
});
const importedEvidenceViewSchema = z.object({
  id: z.uuid(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  tags: z.array(z.string()),
  status: z.string(),
  readyAt: dateTimeSchema.nullable(),
});

@ApiTags('Buyer–Shop chat')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('chat')
export class ChatController {
  constructor(
    private readonly service: ChatService,
    private readonly media: ChatMediaService,
    private readonly evidence: ChatEvidenceService,
  ) {}
  @Post('conversations')
  @HttpCode(200)
  @Serialize(chatConversationViewSchema)
  open(
    @CurrentUser() user: User,
    @Body({ schema: openChatSchema }) input: { shopId: string },
  ) {
    return this.service.open(user.id, input.shopId);
  }
  @Get('conversations')
  @Serialize(chatConversationPageSchema)
  list(
    @CurrentUser() user: User,
    @Query({ schema: chatListSchema }) input: { limit: number; offset: number },
  ) {
    return this.service.list(user.id, input);
  }
  @Get('conversations/:id')
  @Serialize(chatConversationViewSchema)
  detail(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.detail(user.id, id);
  }
  @Get('conversations/:id/messages')
  @Serialize(chatMessagePageSchema)
  messages(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Query({ schema: chatPageSchema }) input: ChatPageInput,
  ) {
    return this.service.messages(user.id, id, input);
  }
  @Post('conversations/:id/messages')
  @HttpCode(200)
  @Serialize(chatMessageViewSchema)
  send(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: sendChatSchema }) input: SendChatInput,
  ) {
    return this.service.send(user.id, id, input);
  }
  @Post('conversations/:id/read')
  @HttpCode(200)
  @Serialize(chatConversationViewSchema)
  read(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: chatReadSchema }) input: { throughSequence: number },
  ) {
    return this.service.read(user.id, id, input.throughSequence);
  }
  @Post('conversations/:id/uploads')
  @HttpCode(200)
  @Serialize(chatUploadTicketSchema)
  upload(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: chatUploadSchema })
    input: { mimeType: string; sizeBytes: number },
  ) {
    return this.media.createUpload(user.id, id, input);
  }
  @Post('media/:id/complete')
  @HttpCode(200)
  @Serialize(chatMediaViewSchema)
  complete(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.media.complete(user.id, id);
  }
  @Get('media/:id/download')
  @Serialize(chatDownloadSchema)
  download(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.media.download(user.id, id);
  }
  @Post('media/:id/dispute-evidence')
  @HttpCode(200)
  @Serialize(importedEvidenceViewSchema)
  importEvidence(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: importEvidenceSchema })
    input: { orderId: string; tags: string[] },
  ) {
    return this.evidence.import(user.id, id, input.orderId, input.tags);
  }
}
