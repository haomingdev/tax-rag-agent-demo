import { Injectable, Logger } from '@nestjs/common';
import { WeaviateService } from '../weaviate/weaviate.service';
import { v4 as uuidv4 } from 'uuid';
// import { ConfigService } from '@nestjs/config'; // Will be used later

// Define a type for IngestJob properties for clarity
interface IngestJobProperties {
  jobId: string;
  url: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  queuedAt: string;
  completedAt?: string;
  errorMessage?: string;
  // Adding an index signature to satisfy the Weaviate client's expected type.
  // This allows any string key and ensures compatibility.
  [key: string]: string | undefined | ('QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED');
}

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);
  private readonly ingestJobClassName = 'IngestJob';

  constructor(
    private readonly weaviateService: WeaviateService,
    // private readonly configService: ConfigService, // Inject if needed for API keys, etc.
  ) {}

  async startIngestion(url: string): Promise<{ jobId: string }> {
    const jobId = uuidv4();
    const queuedAt = new Date().toISOString();

    this.logger.log(`Starting ingestion for URL: ${url} with Job ID: ${jobId}`);

    const initialJobData: IngestJobProperties = {
      jobId,
      url,
      status: 'QUEUED',
      queuedAt,
    };

    try {
      // 1. Create initial 'QUEUED' job record in Weaviate
      // Weaviate generates its own internal UUID for the object, we store our jobId as a property.
      const weaviateClient = this.weaviateService.getClient();
      const createdObject = await weaviateClient.data
        .creator()
        .withClassName(this.ingestJobClassName)
        // @ts-ignore 
        .withObject(initialJobData) // Changed from withProperties
        .withId(jobId) // Use our jobId as Weaviate's object ID for easier direct lookup/update
        .do();
      
      this.logger.log(`IngestJob ${jobId} created in Weaviate with internal ID: ${createdObject.id}, status: QUEUED`);

      // 2. Update status to 'PROCESSING'
      // Note: We are updating the object using our jobId which we've set as Weaviate's object ID.
      await weaviateClient.data
        .updater()
        .withId(jobId) // Target the object by its ID (our jobId)
        .withClassName(this.ingestJobClassName)
        // @ts-ignore
        .withObject({ status: 'PROCESSING' }) // Changed from withProperties
        .do();
      this.logger.log(`IngestJob ${jobId} status updated to PROCESSING`);

      // STUBBED: Simulate document fetching, parsing, chunking, embedding
      this.logger.log(`[Stubbed] Simulating processing for job ${jobId}...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate 2s work
      this.logger.log(`[Stubbed] Processing complete for job ${jobId}.`);

      // STUBBED: Simulate storing document and chunks
      // In a real scenario, you'd create 'Document' and 'Chunk' objects here.
      this.logger.log(`[Stubbed] Storing document and chunks for job ${jobId}...`);
      // Example: await this.weaviateService.storeDocument(...);
      // Example: await this.weaviateService.storeChunks(...);

      // 3. Update status to 'COMPLETED'
      const completedAt = new Date().toISOString();
      await weaviateClient.data
        .updater()
        .withId(jobId)
        .withClassName(this.ingestJobClassName)
        // @ts-ignore
        .withObject({ status: 'COMPLETED', completedAt }) // Changed from withProperties
        .do();
      this.logger.log(`IngestJob ${jobId} status updated to COMPLETED`);

      return { jobId };

    } catch (error) {
      this.logger.error(`Error during ingestion process for job ${jobId}:`, error);
      const errorMessage = error.message || 'Unknown error during ingestion';
      const completedAt = new Date().toISOString(); // Mark completion time even for failure

      try {
        // Attempt to update Weaviate with FAILED status
        // Check if client is available, might not be if connection failed initially
        const weaviateClient = this.weaviateService.getClient();
        if (weaviateClient) {
          await weaviateClient.data
            .updater()
            .withId(jobId) // Use our jobId which is Weaviate's object ID
            .withClassName(this.ingestJobClassName)
            // @ts-ignore
            .withObject({ status: 'FAILED', errorMessage, completedAt }) // Changed from withProperties
            .do();
          this.logger.log(`IngestJob ${jobId} status updated to FAILED in Weaviate.`);
        }
      } catch (updateError) {
        this.logger.error(
          `Failed to update IngestJob ${jobId} to FAILED in Weaviate after initial error:`, 
          updateError
        );
      }
      // Re-throw or return an error structure if the controller needs to act on it differently
      // For now, the controller returns a generic success message for 202, so we just log.
      // If the controller was to return 500 on failure, we would throw here.
      return { jobId }; // Still return jobId, status can be checked via another endpoint later
    }
  }
}
