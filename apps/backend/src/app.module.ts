import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WeaviateModule } from './weaviate/weaviate.module';
import { ConfigModule } from '@nestjs/config';
import { DocumentIngestionModule } from './document-ingestion/document-ingestion.module';
import { IngestionModule } from './ingestion/ingestion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env', 
    }),
    WeaviateModule,
    DocumentIngestionModule,
    IngestionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
