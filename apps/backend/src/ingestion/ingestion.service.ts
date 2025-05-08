import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import playwright, { Browser, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import * as R from 'ramda';
import axios from 'axios';
import * as pdfParse from 'pdf-parse';
import { Document } from '@langchain/core/documents';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { WeaviateService } from '../weaviate/weaviate.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { IngestionJobData } from './ingestion.types';
import * as fs from 'fs/promises';
import * as path from 'path';

export const INGESTION_QUEUE_NAME = 'ingestion-queue';

@Injectable()
export class IngestionService {
  private browser: Browser | null = null;
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectQueue(INGESTION_QUEUE_NAME) private readonly ingestionQueue: Queue<IngestionJobData>,
    private readonly configService: ConfigService,
    private readonly weaviateService: WeaviateService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Playwright browser...');
    await this.initializeBrowser();
  }

  async initializeBrowser() {
    try {
      if (this.browser) {
        this.logger.log('Closing existing browser instance before re-initializing.');
        await this.browser.close();
        this.browser = null;
      }
      this.browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.logger.log('Playwright browser initialized successfully.');
      this.browser.on('disconnected', () => {
        this.logger.warn('Playwright browser disconnected.');
        this.browser = null;
      });
    } catch (error) {
      this.logger.error('Failed to initialize Playwright browser:', error.stack);
      this.browser = null;
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      this.logger.log('Closing Playwright browser...');
      await this.browser.close();
    }
  }

  async addUrlToQueue(url: string): Promise<Job<IngestionJobData>> {
    this.logger.log(`Adding ingestion job for URL: ${url} to queue ${this.ingestionQueue.name}`);

    const weaviateJobId = uuidv4();
    const jobProperties = {
      jobId: weaviateJobId,
      url: url,
      status: 'pending',
      queuedAt: new Date().toISOString(),
    };

    try {
      await this.weaviateService.createObject('IngestJob', jobProperties, weaviateJobId);
      this.logger.log(`IngestJob ${weaviateJobId} created in Weaviate for URL: ${url}`);

      const job = await this.ingestionQueue.add('ingestUrl', { url, weaviateJobId });
      this.logger.log(`Job ${job.id} (BullMQ ID) / ${weaviateJobId} (Weaviate ID) added to queue ${this.ingestionQueue.name} for URL: ${url}`);
      return job;
    } catch (error) {
      this.logger.error(`Failed to create IngestJob in Weaviate or add to queue for URL ${url}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async fetchHtmlContent(url: string, jobId?: string): Promise<any | null> {
    const jobLogPrefix = jobId ? `(IngestJob ${jobId}) ` : '';
    this.logger.log(`${jobLogPrefix}Attempting to fetch HTML content for URL: ${url}`);

    if (!this.browser || !this.browser.isConnected()) {
      this.logger.warn(`${jobLogPrefix}Playwright browser not initialized or disconnected. Attempting to launch...`);
      if (this.browser) {
        try {
          await this.browser.close();
          this.logger.log('Successfully closed existing disconnected browser instance.');
        } catch (closeError) {
          this.logger.error('Error attempting to close disconnected browser instance:', closeError.stack);
        }
        this.browser = null;
      }
      try {
        this.logger.log('Launching new browser instance...');
        this.browser = await playwright.chromium.launch();
        this.logger.log('New browser instance launched successfully.');
      } catch (launchError) {
        this.logger.error('Failed to launch new browser instance.', launchError.stack);
        return null;
      }
    }

    let page: Page | null = null;
    const screenshotDir = '/tmp/tax_agent_screenshots';
    const sanitizedJobId = jobId?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown_job';

    try {
      if (!this.browser || !this.browser.isConnected()) {
        this.logger.error('Browser is still not available or connected after attempting re-initialization. Cannot create new page.');
        return null;
      }

      page = await this.browser.newPage();
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      });
      this.logger.log(`${jobLogPrefix}Navigating to URL: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

      const htmlContent = await page.content();
      this.logger.debug(`${jobLogPrefix}Raw HTML content fetched for ${url} (first 1000 chars): ${htmlContent.substring(0, 1000)}`);
      if (!htmlContent || htmlContent.length < 100) {
        this.logger.warn(`${jobLogPrefix}Fetched HTML content for ${url} seems too short or empty.`);
      }

      this.logger.log(`${jobLogPrefix}Attempting to extract article from HTML...`);
      const article = await this.extractArticle(htmlContent, url, jobId);

      this.logger.debug(`${jobLogPrefix}Raw article object from extractus for ${url} (first 1000 chars): ${JSON.stringify(article)?.substring(0, 1000)}`);

      if (!article || !article.content || !article.title) {
        this.logger.warn(`${jobLogPrefix}No title or content extracted by article-extractor for URL: ${url}. Article object: ${JSON.stringify(article)}`);
        if (page && jobId) {
          const screenshotPath = `${screenshotDir}/failed_extraction_${sanitizedJobId}.png`;
          try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            this.logger.log(`${jobLogPrefix}Screenshot saved to ${screenshotPath} for failed extraction.`);
          } catch (ssError) {
            this.logger.error(`${jobLogPrefix}Failed to save screenshot: ${ssError.message}`);
          }
        }
        return null;
      }

      this.logger.log(`${jobLogPrefix}Article extracted successfully for URL: ${url} (Title: ${article.title})`);
      return article;
    } catch (error) {
      this.logger.error(`${jobLogPrefix}Error fetching or processing content for URL ${url}: ${error.message}`, error.stack);
      if (page && jobId) {
        const screenshotPath = `${screenshotDir}/error_page_${sanitizedJobId}.png`;
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          this.logger.log(`${jobLogPrefix}Screenshot saved to ${screenshotPath} due to error.`);
        } catch (ssError) {
          this.logger.error(`${jobLogPrefix}Failed to save screenshot during error handling: ${ssError.message}`);
        }
      }
      return null;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  private async extractArticle(htmlContent: string, url: string, jobId?: string): Promise<any | null> {
    const jobLogPrefix = jobId ? `(IngestJob ${jobId}) ` : '';
    try {
      this.logger.debug(`${jobLogPrefix}Starting article extraction for URL: ${url}`);

      const articleExtractor = await import('@extractus/article-extractor');
      const extractFunction = articleExtractor.extract;

      if (!htmlContent) {
        this.logger.warn(`${jobLogPrefix}HTML content is empty for URL: ${url}. Skipping extraction.`);
        return null;
      }

      const article: any = await extractFunction(htmlContent);

      if (!article) {
        this.logger.warn(`${jobLogPrefix}Article extraction returned null for URL: ${url}.`);
        return null;
      }

      this.logger.debug(`${jobLogPrefix}Typeof extracted article: ${typeof article}`);
      if (article && typeof article === 'object') {
        this.logger.debug(`${jobLogPrefix}Keys of extracted article: ${Object.keys(article).join(', ')}`);
      }

      this.logger.debug(`${jobLogPrefix}Extraction attempt completed for ${url}. Title: ${article.title}, Content length: ${article.content?.length}`);
      return article;

    } catch (error) {
      this.logger.error(`${jobLogPrefix}Error during article extraction for URL ${url}: ${error.message}`, error.stack);
      return null;
    }
  }

  private async fetchPdfContent(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      if (response.status !== 200) {
        this.logger.error(`Failed to download PDF from ${url}. Status: ${response.status}`);
        return null;
      }
      const data = await pdfParse(response.data);
      return data.text;
    } catch (error) {
      this.logger.error(`Error fetching or parsing PDF content from ${url}: ${error.message}`, error.stack);
      return null;
    }
  }

  async processUrlForIngestion(job: Job<IngestionJobData>): Promise<void> {
    const { url, weaviateJobId } = job.data;
    this.logger.log(`Processing IngestJob ${weaviateJobId} for URL: ${url}`);

    await this.weaviateService.updateObject('IngestJob', weaviateJobId, { // Corrected argument order
      status: 'processing',
      updatedAt: new Date().toISOString(),
    });
    this.logger.log(`IngestJob ${weaviateJobId} status updated to 'processing'.`);

    try {
      let rawDocText: string | null = null;
      let documentTitle: string | null = null;
      let articleSourceUrl: string | null = url;

      if (url.endsWith('.pdf')) {
        const pdfContent = await this.fetchPdfContent(url);
        if (pdfContent) {
          rawDocText = pdfContent;
          documentTitle = url.substring(url.lastIndexOf('/') + 1);
          this.logger.log(`(IngestJob ${weaviateJobId}) PDF content fetched for ${url}: Title - ${documentTitle}, Length - ${rawDocText.length}`);
        } else {
          this.logger.warn(`(IngestJob ${weaviateJobId}) Could not fetch PDF content for ${url}.`);
        }
      } else {
        const articleData = await this.fetchHtmlContent(url, weaviateJobId);
        if (articleData && articleData.content && articleData.title) {
          rawDocText = articleData.content;
          documentTitle = articleData.title;
          articleSourceUrl = articleData.url || url;
          this.logger.log(`(IngestJob ${weaviateJobId}) HTML content extracted for ${url}: Title - ${documentTitle}, Source URL for chunks: ${articleSourceUrl}, Content Length - ${rawDocText.length}`);
        } else {
          this.logger.warn(`(IngestJob ${weaviateJobId}) No content or title could be extracted for URL: ${url}. ArticleData: ${JSON.stringify(articleData)?.substring(0, 200)}`);
        }
      }

      if (!rawDocText || !documentTitle) {
        this.logger.warn(`No content could be cleaned/fetched for URL: ${url} (IngestJob ${weaviateJobId})`);
        this.logger.error(`IngestJob ${weaviateJobId} failed: No content could be cleaned or fetched for URL: ${url}`);
        await this.weaviateService.updateObject('IngestJob', weaviateJobId, { // Corrected argument order
          status: 'failed',
          errorMessage: 'No content could be cleaned or fetched.',
          completedAt: new Date().toISOString(),
        });
        return;
      }
      this.logger.log(`Cleaned text for IngestJob ${weaviateJobId}. Length: ${rawDocText.length}`);

      const rawDocId = uuidv4();
      const rawDocProperties = {
        docId: rawDocId,
        jobId: [{ beacon: `weaviate://localhost/IngestJob/${weaviateJobId}` }],
        sourceUrl: url,
        title: documentTitle || 'Untitled Document',
        createdAt: new Date().toISOString(),
      };
      await this.weaviateService.createObject('RawDoc', rawDocProperties, rawDocId);
      this.logger.log(`RawDoc ${rawDocId} created for IngestJob ${weaviateJobId}`);

      const chunks = await this.chunkText(rawDocText);
      if (!chunks || chunks.length === 0) {
        this.logger.warn(`No chunks generated for URL: ${url} (IngestJob ${weaviateJobId})`);
        this.logger.error(`IngestJob ${weaviateJobId} failed: No chunks were generated from the content for URL: ${url}`);
        await this.weaviateService.updateObject('IngestJob', weaviateJobId, { // Corrected argument order
          status: 'failed',
          errorMessage: 'No chunks were generated from the content.',
          completedAt: new Date().toISOString(),
        });
        return;
      }
      this.logger.log(`Generated ${chunks.length} chunks for IngestJob ${weaviateJobId}.`);

      const embeddings = await this.generateEmbeddings(chunks);
      if (!embeddings || embeddings.length !== chunks.length) {
        this.logger.warn(`Failed to generate embeddings or count mismatch for IngestJob ${weaviateJobId}`);
        this.logger.error(`IngestJob ${weaviateJobId} failed: Failed to generate embeddings or embedding count mismatch for URL: ${url}`);
        await this.weaviateService.updateObject('IngestJob', weaviateJobId, { // Corrected argument order
          status: 'failed',
          errorMessage: 'Failed to generate embeddings or embedding count mismatch.',
          completedAt: new Date().toISOString(),
        });
        return;
      }
      this.logger.log(`Embeddings generated for IngestJob ${weaviateJobId}. Count: ${embeddings.length}.`);

      const createChunkPromises = chunks.map((chunkText, index) => {
        const chunkId = uuidv4();
        const chunkProperties = {
          chunkId: chunkId,
          docId: [{ beacon: `weaviate://localhost/RawDoc/${rawDocId}` }],
          jobId: [{ beacon: `weaviate://localhost/IngestJob/${weaviateJobId}` }],
          text: chunkText,
          url: articleSourceUrl || url,
          docTitle: documentTitle || 'Untitled Document',
        };
        return this.weaviateService.createObject('DocChunk', chunkProperties, chunkId, embeddings[index]);
      });

      await Promise.all(createChunkPromises);
      this.logger.log(`All ${chunks.length} DocChunk objects created for IngestJob ${weaviateJobId}.`);

      await this.weaviateService.updateObject('IngestJob', weaviateJobId, { // Corrected argument order
        status: 'completed',
        docChunkIds: chunks.map((_, index) => `DocChunk/${uuidv4()}`),
        rawDocId: rawDocId,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        errorMessage: null,
      });
      this.logger.log(`IngestJob ${weaviateJobId} completed successfully for URL: ${url}.`);
    } catch (error) {
      this.logger.error(`IngestJob ${weaviateJobId} failed: ${error.message}`, error.stack);
      await this.weaviateService.updateObject('IngestJob', weaviateJobId, { // Corrected argument order
        status: 'failed',
        errorMessage: error.message,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }
  }

  private async chunkText(text: string): Promise<string[]> {
    if (!text || text.trim() === '') {
      this.logger.log('Text input is empty or whitespace, returning no chunks.');
      return [];
    }
    try {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const chunks = await splitter.splitText(text);
      this.logger.log(`Successfully split text into ${chunks.length} chunks.`);
      return chunks;
    } catch (error) {
      this.logger.error(`Error during text chunking: ${error.message}`, error.stack);
      return [];
    }
  }

  private async generateEmbeddings(chunks: string[]): Promise<number[][] | null> {
    if (!chunks || chunks.length === 0) {
      this.logger.log('No chunks provided to generate embeddings.');
      return [];
    }
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured. Cannot generate embeddings.');
      return null;
    }

    try {
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey,
        model: 'models/text-embedding-004',
      });
      const documentEmbeddings = await embeddings.embedDocuments(chunks);
      this.logger.log(`Successfully generated ${documentEmbeddings.length} embeddings.`);
      if (documentEmbeddings.length > 0 && documentEmbeddings[0]) {
        this.logger.log(`First embedding dimension: ${documentEmbeddings[0].length}`);
      }
      return documentEmbeddings;
    } catch (error) {
      this.logger.error(`Error generating embeddings: ${error.message}`, error.stack);
      return null;
    }
  }
}
