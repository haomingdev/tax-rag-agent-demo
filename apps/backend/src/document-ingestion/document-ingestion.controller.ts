import { Controller, Post, Body, ValidationPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { DocumentIngestionService } from './document-ingestion.service';
import { IngestDocumentDto } from './dto/ingest-document.dto';

@Controller('api/documents') // Set base path for this controller
export class DocumentIngestionController {
  constructor(private readonly documentIngestionService: DocumentIngestionService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED) // Return 202 Accepted as ingestion is async
  async ingestDocument(@Body(new ValidationPipe({ transform: true, whitelist: true })) ingestDocumentDto: IngestDocumentDto) {
    // No need to await here if we want to return 202 immediately
    // The service method can run in the background.
    // However, for initial implementation, we might await to ensure flow.
    // For a true async job, we'd typically return a job ID.
    const result = await this.documentIngestionService.startIngestion(ingestDocumentDto.url);
    return { message: 'Document ingestion started.', data: result }; // Or return job details
  }
}
