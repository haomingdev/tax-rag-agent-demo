import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WeaviateModule } from './weaviate/weaviate.module';
import { ConfigModule } from '@nestjs/config';
import { DocumentIngestionModule } from './document-ingestion/document-ingestion.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env', 
    }),
    WeaviateModule,
    DocumentIngestionModule,
    IngestionModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
