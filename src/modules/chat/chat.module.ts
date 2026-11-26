import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { MediaModule } from '@/modules/media/media.module';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatConversation, ChatMessage } from './entities';
import { ChatMessageMedia } from './entities/chat-message-media.entity';

@Module({
  imports: [
    StorageModule,
    MediaModule,
    AuthorizationModule,
    TypeOrmModule.forFeature([ChatConversation, ChatMessage, ChatMessageMedia]),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
