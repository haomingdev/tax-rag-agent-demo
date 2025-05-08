import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { WeaviateModule } from '../weaviate/weaviate.module'; // Import WeaviateModule

@Module({
  imports: [
    ConfigModule,
    WeaviateModule, // Add WeaviateModule to imports
  ],
  controllers: [ChatController],
  providers: [ChatService, Logger],
  // exports: [ChatService],
})
export class ChatModule {}
