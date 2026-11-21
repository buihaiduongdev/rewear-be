import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { OrderAccess } from '@/modules/order/order.access';

import { ChatAccess } from './chat.access';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatEvidenceLink } from './entities/chat-evidence.entity';
import {
  ChatConversation,
  ChatMedia,
  ChatMessage,
} from './entities/chat.entity';
import { ChatEvidenceService } from './media/chat-evidence.service';
import { ChatMediaService } from './media/chat-media.service';

@Module({
  imports: [
    AuthorizationModule,
    TypeOrmModule.forFeature([
      ChatConversation,
      ChatMessage,
      ChatMedia,
      ChatEvidenceLink,
    ]),
  ],
  controllers: [ChatController],
  providers: [
    ChatAccess,
    ChatService,
    ChatMediaService,
    ChatEvidenceService,
    PrivateEvidenceStorage,
    DisputeAccess,
    OrderAccess,
  ],
  exports: [ChatService],
})
export class ChatModule {}
