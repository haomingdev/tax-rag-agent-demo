import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import * as R from 'ramda';
import axios from 'axios';
import pdfParse from 'pdf-parse'; 
import { extract } from '@extractus/article-extractor';
import { chromium, Browser, Page } from 'playwright';
import { Document } from '@langchain/core/documents';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { WeaviateService } from '../weaviate/weaviate.service';

export const INGESTION_QUEUE_NAME = 'ingestion-queue';

export interface IngestionJobData {
  url: string;
  weaviateJobId: string;
}

@Injectable()
export class IngestionService {
  private browser: Browser | null = null;

  constructor(
    @InjectQueue(INGESTION_QUEUE_NAME) private readonly ingestionQueue: Queue<IngestionJobData>,
    private readonly serviceLogger: Logger,
    private readonly configService: ConfigService,
    private readonly weaviateService: WeaviateService,
  ) {}

  async onModuleInit() {
    this.serviceLogger.log('Initializing browser for IngestionService...');
    try {
      this.browser = await chromium.launch();
      this.serviceLogger.log('Browser initialized successfully.');
    } catch (error) {
      this.serviceLogger.error('Failed to launch browser on module init.', error.stack);
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      this.serviceLogger.log('Closing browser for IngestionService...');
      await this.browser.close();
      this.serviceLogger.log('Browser closed successfully.');
    }
  }

  async addIngestionJob(url: string): Promise<Job<IngestionJobData, any, string>> {
    this.serviceLogger.log(`Adding ingestion job for URL: ${url} to queue ${this.ingestionQueue.name}`);
    
    const weaviateJobId = uuidv4();
    const jobProperties = {
      jobId: weaviateJobId,
      url: url,
      status: 'pending',
      queuedAt: new Date().toISOString(),
    };

    try {
      await this.weaviateService.createObject('IngestJob', jobProperties, weaviateJobId);
      this.serviceLogger.log(`IngestJob ${weaviateJobId} created in Weaviate for URL: ${url}`);
      
      const job = await this.ingestionQueue.add('ingestUrl', { url, weaviateJobId });
      this.serviceLogger.log(`Job ${job.id} (BullMQ ID) / ${weaviateJobId} (Weaviate ID) added to queue ${this.ingestionQueue.name} for URL: ${url}`);
      return job;
    } catch (error) {
      this.serviceLogger.error(
        `Failed to create IngestJob in Weaviate or add to queue for URL ${url}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async fetchHtmlContent(url: string): Promise<string | null> {
    if (!this.browser) {
      this.serviceLogger.error('Browser not initialized. Cannot fetch HTML content.');
      try {
        this.serviceLogger.log('Attempting to re-initialize browser...');
        this.browser = await chromium.launch();
        this.serviceLogger.log('Browser re-initialized successfully.');
      } catch (initError) {
        this.serviceLogger.error('Failed to re-initialize browser.', initError.stack);
        return null;
      }
    }
    let page: Page | null = null;
    try {
      page = await this.browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      const content = await page.content();
      return content;
    } catch (error) {
      this.serviceLogger.error(`Error fetching HTML content from ${url}: ${error.message}`, error.stack);
      return null;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  private async fetchPdfContent(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      if (response.status !== 200) {
        this.serviceLogger.error(`Failed to download PDF from ${url}. Status: ${response.status}`);
        return null;
      }
      const data = await pdfParse(response.data);
      return data.text;
    } catch (error) {
      this.serviceLogger.error(`Error fetching or parsing PDF content from ${url}: ${error.message}`, error.stack);
      return null;
    }
  }

  private async cleanHtml(htmlContent: string, url: string): Promise<string | null> {
    try {
      const article = await extract(htmlContent);
      return article ? article.content : null;
    } catch (error) {
      this.serviceLogger.error(`Error cleaning HTML content for URL ${url}: ${error.message}`, error.stack);
      return null;
    }
  }

  private async chunkText(text: string): Promise<string[]> {
    if (!text || text.trim() === '') {
      this.serviceLogger.log('Text input is empty or whitespace, returning no chunks.');
      return [];
    }
    try {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const chunks = await splitter.splitText(text);
      this.serviceLogger.log(`Successfully split text into ${chunks.length} chunks.`);
      return chunks;
    } catch (error) {
      this.serviceLogger.error(`Error during text chunking: ${error.message}`, error.stack);
      return [];
    }
  }

  private async generateEmbeddings(chunks: string[]): Promise<number[][] | null> {
    if (!chunks || chunks.length === 0) {
      this.serviceLogger.log('No chunks provided to generate embeddings.');
      return [];
    }
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.serviceLogger.error('GEMINI_API_KEY is not configured. Cannot generate embeddings.');
      return null;
    }

    try {
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey,
        model: 'models/text-embedding-004',
      });
      const documentEmbeddings = await embeddings.embedDocuments(chunks);
      this.serviceLogger.log(`Successfully generated ${documentEmbeddings.length} embeddings.`);
      if (documentEmbeddings.length > 0 && documentEmbeddings[0]) {
        this.serviceLogger.log(`First embedding dimension: ${documentEmbeddings[0].length}`);
      }
      return documentEmbeddings;
    } catch (error) {
      this.serviceLogger.error(`Error generating embeddings: ${error.message}`, error.stack);
      return null;
    }
  }

  async processUrlForIngestion(jobData: IngestionJobData): Promise<void> {
    const { url, weaviateJobId } = jobData;
    this.serviceLogger.log(
      `Processing IngestJob ${weaviateJobId} for URL: ${url}`,
    );

    try {
      // Update IngestJob status to 'processing'
      await this.weaviateService.updateObject('IngestJob', weaviateJobId, {
        status: 'processing',
        processingStartedAt: new Date().toISOString(),
      });
      this.serviceLogger.log(`IngestJob ${weaviateJobId} status updated to 'processing'.`);

      let rawContent: string | null = null;
      let cleanedText: string | null = null;
      let documentTitle: string | null = null; // To store the title for RawDoc

      if (url.endsWith('.pdf')) {
        rawContent = await this.fetchPdfContent(url);
        cleanedText = rawContent; // PDF text is used as is
        documentTitle = url.substring(url.lastIndexOf('/') + 1); // Use filename as title for PDF
      } else {
        rawContent = await this.fetchHtmlContent(url);
        if (rawContent) {
          // Try to extract title along with content if cleanHtml can provide it
          // For now, assuming cleanHtml just returns content string.
          // If article-extractor gives title, we can get it there.
          try {
            const article = await extract(rawContent);
            if (article) {
              cleanedText = article.content;
              documentTitle = article.title || url; // Fallback to URL if title not found
            } else {
              cleanedText = null;
            }
          } catch (extractError) {
            this.serviceLogger.error(`Error extracting article from HTML for ${url}: ${extractError.message}`, extractError.stack);
            cleanedText = null; // Proceeding without content if extraction fails severely
          }
        }
      }

      if (!cleanedText) {
        this.serviceLogger.warn(`No content could be cleaned/fetched for URL: ${url} (IngestJob ${weaviateJobId})`);
        this.serviceLogger.error(`IngestJob ${weaviateJobId} failed: No content could be cleaned or fetched for URL: ${url}`);
        await this.weaviateService.updateObject('IngestJob', weaviateJobId, {
          status: 'failed',
          errorMessage: 'No content could be cleaned or fetched.',
          completedAt: new Date().toISOString(),
        });
        return;
      }
      this.serviceLogger.log(`Cleaned text for IngestJob ${weaviateJobId}. Length: ${cleanedText.length}`);

      // 2. Create RawDoc object in Weaviate
      const rawDocId = uuidv4();
      const rawDocProperties = {
        docId: rawDocId,
        jobId: [{ beacon: `weaviate://localhost/IngestJob/${weaviateJobId}` }], // This needs to be a cross-reference. Assuming Weaviate handles this representation.
        sourceUrl: url,
        title: documentTitle || 'Untitled Document',
        createdAt: new Date().toISOString(),
      };
      await this.weaviateService.createObject('RawDoc', rawDocProperties, rawDocId);
      this.serviceLogger.log(`RawDoc ${rawDocId} created for IngestJob ${weaviateJobId}`);

      const chunks = await this.chunkText(cleanedText);
      if (!chunks || chunks.length === 0) {
        this.serviceLogger.warn(`No chunks generated for URL: ${url} (IngestJob ${weaviateJobId})`);
        this.serviceLogger.error(`IngestJob ${weaviateJobId} failed: No chunks were generated from the content for URL: ${url}`);
        await this.weaviateService.updateObject('IngestJob', weaviateJobId, {
          status: 'failed',
          errorMessage: 'No chunks were generated from the content.',
          completedAt: new Date().toISOString(),
        });
        return;
      }
      this.serviceLogger.log(`Generated ${chunks.length} chunks for IngestJob ${weaviateJobId}.`);

      const embeddings = await this.generateEmbeddings(chunks);
      if (!embeddings || embeddings.length !== chunks.length) {
        this.serviceLogger.warn(`Failed to generate embeddings or count mismatch for IngestJob ${weaviateJobId}`);
        this.serviceLogger.error(`IngestJob ${weaviateJobId} failed: Failed to generate embeddings or embedding count mismatch for URL: ${url}`);
        await this.weaviateService.updateObject('IngestJob', weaviateJobId, {
          status: 'failed',
          errorMessage: 'Failed to generate embeddings or embedding count mismatch.',
          completedAt: new Date().toISOString(),
        });
        return;
      }
      this.serviceLogger.log(`Embeddings generated for IngestJob ${weaviateJobId}. Count: ${embeddings.length}.`);

      // 3. Create DocChunk objects in Weaviate (batch operation)
      const createChunkPromises = chunks.map((chunkText, index) => {
        const chunkId = uuidv4();
        const chunkProperties = {
          chunkId: chunkId,
          docId: [{ beacon: `weaviate://localhost/RawDoc/${rawDocId}` }],
          jobId: [{ beacon: `weaviate://localhost/IngestJob/${weaviateJobId}` }],
          text: chunkText,
          url: url, // Store original URL with each chunk
          docTitle: documentTitle || 'Untitled Document', // Store document title
          // vector: embeddings[index], // Weaviate handles auto-vectorization if module is configured
        };
        return this.weaviateService.createObject(
          'DocChunk',
          chunkProperties,
          chunkId,
          embeddings[index], // Pass vector here for manual vectorization
        );
      });

      await Promise.all(createChunkPromises);
      this.serviceLogger.log(`All ${chunks.length} DocChunk objects created for IngestJob ${weaviateJobId}.`);

      // 4. Update IngestJob status to 'completed'
      await this.weaviateService.updateObject('IngestJob', weaviateJobId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        errorMessage: null, // Clear any previous error message
      });
      this.serviceLogger.log(`IngestJob ${weaviateJobId} completed successfully for URL: ${url}.`);
    } catch (error) {
      this.serviceLogger.error(
        `Unhandled error processing IngestJob ${weaviateJobId} for URL ${url}: ${error.message}`,
        error.stack,
      );
      // Determine a more specific error message if possible
      let finalErrorMessage = error.message || 'An unexpected error occurred during ingestion.';
      if (error.message && error.message.includes('Weaviate createObject for DocChunk failed')) { 
        finalErrorMessage = `Error creating DocChunk in Weaviate: ${error.message}`; 
      } else if (error.message && error.message.includes('Weaviate createObject failed')) { 
         finalErrorMessage = `Error creating an object in Weaviate: ${error.message}`;
      }

      // Ensure job status is updated to failed even for unexpected errors
      try {
        await this.weaviateService.updateObject('IngestJob', weaviateJobId, {
          status: 'failed',
          errorMessage: finalErrorMessage,
          completedAt: new Date().toISOString(),
        });
      } catch (updateError) {
        this.serviceLogger.error(
          `Failed to update IngestJob ${weaviateJobId} status to failed after an unhandled error: ${updateError.message}`,
          updateError.stack,
        );
      }
    }
  }
}
