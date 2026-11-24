import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { MediaModule } from '@/modules/media/media.module';
import { OrderAccess } from '@/modules/order/order.access';

import { ChatAccess } from './chat.access';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatMessageMedia } from './entities/chat-message-media.entity';
import { ChatConversation, ChatMessage } from './entities/chat.entity';
import { ChatEvidenceService } from './media/chat-evidence.service';
import { ChatMediaService } from './media/chat-media.service';

@Module({
  imports: [
    StorageModule,
    MediaModule,
    AuthorizationModule,
    TypeOrmModule.forFeature([ChatConversation, ChatMessage, ChatMessageMedia]),
  ],
  controllers: [ChatController],
  providers: [
    ChatAccess,
    ChatService,
    ChatMediaService,
    ChatEvidenceService,
    DisputeAccess,
    OrderAccess,
  ],
  exports: [ChatService],
})
export class ChatModule {}
