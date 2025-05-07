import { Module } from '@nestjs/common';
import { DocumentIngestionService } from './document-ingestion.service';
import { DocumentIngestionController } from './document-ingestion.controller';
import { WeaviateModule } from '../weaviate/weaviate.module';

@Module({
  imports: [WeaviateModule],
  controllers: [DocumentIngestionController],
  providers: [DocumentIngestionService],
})
export class DocumentIngestionModule {}
