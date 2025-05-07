import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WeaviateModule } from './weaviate/weaviate.module';
import { ConfigModule } from '@nestjs/config';
import { DocumentIngestionModule } from './document-ingestion/document-ingestion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available application-wide
      envFilePath: '.env', // Specifies the .env file path in the project root
    }),
    WeaviateModule,
    DocumentIngestionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
