import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionJobData } from './ingestion.types';

@Processor('ingestion-queue')
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly ingestionService: IngestionService,
  ) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<void> { 
    this.logger.log(`Processing job ${job.id} of type ${job.name} with data: ${JSON.stringify(job.data)} for queue 'ingestion-queue'`);
    try {
      if (job.name === 'ingestUrl') { 
        await this.ingestionService.processUrlForIngestion(job);
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
