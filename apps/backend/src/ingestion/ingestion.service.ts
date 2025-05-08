import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { INGESTION_QUEUE_NAME } from './ingestion.module';
import { chromium, Browser, Page } from 'playwright'; 
import axios from 'axios'; 
import * as pdfParse from 'pdf-parse'; 
import { extract } from '@extractus/article-extractor';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ConfigService } from '@nestjs/config';

export interface IngestionJobData {
  url: string;
}

@Injectable()
export class IngestionService {
  private browser: Browser | null = null;

  constructor(
    @InjectQueue(INGESTION_QUEUE_NAME) private readonly ingestionQueue: Queue<IngestionJobData>,
    private readonly serviceLogger: Logger,
    private readonly configService: ConfigService, // Inject ConfigService
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
    const job = await this.ingestionQueue.add('ingestUrl', { url });
    this.serviceLogger.log(`Job ${job.id} added to queue ${this.ingestionQueue.name} for URL: ${url}`);
    return job;
  }

  private async fetchHtmlContent(url: string): Promise<string | null> {
    if (!this.browser) {
      this.serviceLogger.error('Browser not initialized. Cannot fetch HTML content.');
      // Attempt to re-initialize or throw a more specific error
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
      const article = await extract(htmlContent); // Pass URL for better context if lib uses it - Removed {url} as it's not a valid ParserOption here
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
      return []; // Return empty array on error as per previous logic
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
        model: 'models/text-embedding-004', // As specified in implementation.md
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

  async processUrlForIngestion(url: string): Promise<string | null> {
    this.serviceLogger.log(`Starting ingestion process for URL: ${url}`);
    let rawContent: string | null = null;
    let cleanedText: string | null = null;

    if (url.endsWith('.pdf')) {
      rawContent = await this.fetchPdfContent(url);
      cleanedText = rawContent; // PDF text is used as is for now, or add specific PDF cleaning
    } else {
      rawContent = await this.fetchHtmlContent(url);
      if (rawContent) {
        cleanedText = await this.cleanHtml(rawContent, url);
      }
    }

    if (!cleanedText) {
      this.serviceLogger.warn(`No content could be cleaned or fetched for URL: ${url}`);
      return null;
    }

    this.serviceLogger.log(`Successfully cleaned text for URL: ${url}. Length: ${cleanedText.length}`);
    
    const chunks = await this.chunkText(cleanedText);
    if (!chunks || chunks.length === 0) {
      this.serviceLogger.warn(`No chunks were generated for URL: ${url}. Aborting further processing.`);
      // Depending on desired behavior, might still return the cleanedText or null
      return null; 
    }
    this.serviceLogger.log(`Generated ${chunks.length} chunks for URL: ${url}. First chunk: "${chunks[0].substring(0,100)}..."`);

    const embeddings = await this.generateEmbeddings(chunks);
    if (!embeddings) {
      this.serviceLogger.warn(`Failed to generate embeddings for URL: ${url}.`);
      // Decide if this is a critical failure stopping ingestion or if we proceed without embeddings
      return null; // For now, treat as critical
    }

    // Placeholder for where embeddings would be stored or processed further
    this.serviceLogger.log(`Embeddings generated for ${url}. Count: ${embeddings.length}.`);

    // For now, returning the first chunk as an indication of success, or cleanedText.
    // Later, this method will likely return a status or an ID of the ingested document.
    return cleanedText; // Or chunks[0] or some other indicator
  }
}
