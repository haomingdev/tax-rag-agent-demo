import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { IngestionService, IngestionJobData } from './ingestion.service';
import { INGESTION_QUEUE_NAME } from './ingestion.module';

@Processor(INGESTION_QUEUE_NAME)
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly ingestionService: IngestionService,
  ) {}

  async process(job: Job<IngestionJobData>): Promise<void> { 
    this.logger.log(`Processing job ${job.id} of type ${job.name} with data: ${JSON.stringify(job.data)} for queue ${INGESTION_QUEUE_NAME}`);
    try {
      if (job.name === 'ingestUrl') { 
        await this.ingestionService.processUrlForIngestion(job.data);
        this.logger.log(`Job ${job.id} ('${job.name}') completed successfully.`);
      } else {
        this.logger.warn(`Job ${job.id} has unexpected name '${job.name}'. Skipping.`);
      }
    } catch (error) {
      this.logger.error(
        `Job ${job.id} ('${job.name}') failed with error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
