import { Controller, Post, Body, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IngestRequestDto } from './dtos/ingest-request.dto';
import { IngestionService } from './ingestion.service';

@ApiTags('Ingestion')
@Controller('ingest')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Submit a URL for content ingestion' })
  @ApiResponse({ status: 201, description: 'Ingestion request accepted and job added to queue.' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters.' })
  async submitIngestionRequest(
    @Body() ingestRequestDto: IngestRequestDto,
  ): Promise<{ message: string; jobId: string; data: IngestRequestDto }> {
    this.logger.log(
      `Received ingestion request for URL: ${ingestRequestDto.url}`,
    );

    const job = await this.ingestionService.addIngestionJob(ingestRequestDto.url);

    this.logger.log(
      `Job ${job.id} successfully added via service for URL: ${ingestRequestDto.url}`,
    );

    return {
      message: 'Ingestion request accepted and job added to queue.',
      jobId: job.id,
      data: ingestRequestDto,
    };
  }
}
