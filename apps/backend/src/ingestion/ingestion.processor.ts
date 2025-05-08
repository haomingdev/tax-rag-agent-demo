import { Processor, Process } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { IngestionService, IngestionJobData } from './ingestion.service';
import { INGESTION_QUEUE_NAME } from './ingestion.module'; // Using queue name from module

@Processor(INGESTION_QUEUE_NAME)
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly ingestionService: IngestionService,
  ) {
  }

  @Process('ingestUrl')
  async handleIngestion(job: Job<IngestionJobData>): Promise<void> {
    this.logger.log(`Processing job ${job.id} of type ${job.name} with data: ${JSON.stringify(job.data)} for queue ${INGESTION_QUEUE_NAME}`);
    try {
      await this.ingestionService.processUrlForIngestion(job.data);
      this.logger.log(`Job ${job.id} completed successfully.`);
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed with error: ${error.message}`,
        error.stack,
      );
      // The IngestionService.processUrlForIngestion already updates Weaviate job status.
      // Rethrow error so BullMQ can handle job failure (e.g., retries, move to failed queue)
      throw error;
    }
  }
}
