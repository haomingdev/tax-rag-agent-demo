import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { INGESTION_QUEUE_NAME } from './ingestion.module';
import { chromium, Browser, Page } from 'playwright'; 
import axios from 'axios'; 
import * as pdfParse from 'pdf-parse'; 
import { extract } from '@extractus/article-extractor';

export interface IngestionJobData {
  url: string;
}

@Injectable()
export class IngestionService {
  constructor(
    @InjectQueue(INGESTION_QUEUE_NAME) private readonly ingestionQueue: Queue<IngestionJobData>,
    private readonly serviceLogger: Logger,
  ) {}

  async addIngestionJob(url: string): Promise<Job<IngestionJobData, any, string>> {
    this.serviceLogger.log(`Adding ingestion job for URL: ${url} to queue ${this.ingestionQueue.name}`);
    const job = await this.ingestionQueue.add('ingestUrl', { url });
    this.serviceLogger.log(`Job ${job.id} added to queue ${this.ingestionQueue.name} for URL: ${url}`);
    return job;
  }

  private async fetchHtmlContent(url: string): Promise<string | null> {
    let browser: Browser | null = null;
    try {
      this.serviceLogger.log(`Launching browser to fetch HTML content from: ${url}`);
      browser = await chromium.launch(); 
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      });
      const page: Page = await context.newPage();
      await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
      this.serviceLogger.log(`Navigating to page: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); 

      // Get the full HTML content of the page
      const htmlContent = await page.content();

      // Extract article content using @extractus/article-extractor
      const article = await extract(htmlContent);

      if (article && article.content) {
        this.serviceLogger.log(`Successfully extracted article HTML content from: ${url}. Length: ${article.content.length}`);
        return article.content; // article.content usually contains the cleaned HTML of the article
      } else {
        // Fallback to body.innerText if article extraction fails or content is empty
        this.serviceLogger.warn(`Article extraction failed or content was empty for ${url}. Falling back to body text.`);
        const bodyText = await page.evaluate(() => document.body.innerText);
        this.serviceLogger.log(`Fallback: Fetched body plain text from: ${url}. Length: ${bodyText?.length}`);
        return bodyText || '';
      }
    } catch (error) {
      this.serviceLogger.error(`Error fetching HTML content from ${url}: ${error.message}`);
      return null;
    } finally {
      if (browser) {
        this.serviceLogger.log(`Closing browser for URL: ${url}`);
        await browser.close();
      }
    }
  }

  private async fetchPdfContent(url: string): Promise<string | null> {
    try {
      this.serviceLogger.log(`Fetching PDF content from: ${url}`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer', 
        timeout: 60000, 
      });

      if (response.status !== 200) {
        this.serviceLogger.error(`Failed to download PDF from ${url}. Status: ${response.status}`);
        return null;
      }

      const pdfBuffer = Buffer.from(response.data);
      const data = await pdfParse(pdfBuffer);
      this.serviceLogger.log(`Successfully parsed PDF content from: ${url}. Pages: ${data.numpages}, Length: ${data.text?.length}`);
      return data.text || ''; 
    } catch (error) {
      this.serviceLogger.error(`Error fetching or parsing PDF content from ${url}: ${error.message}`);
      return null;
    }
  }

  async processUrlForIngestion(url: string): Promise<string | null> {
    this.serviceLogger.log(`Processing URL for ingestion: ${url}`);
    let content: string | null = null;

    if (url.toLowerCase().endsWith('.pdf')) {
      this.serviceLogger.log(`Detected PDF content type for: ${url}`);
      content = await this.fetchPdfContent(url);
    } else {
      this.serviceLogger.log(`Assuming HTML content type for: ${url}`);
      content = await this.fetchHtmlContent(url);
    }

    if (content) {
      this.serviceLogger.log(`Content fetched for ${url}, length: ${content.length}. Ready for further processing.`);
      // Here, you would typically parse/chunk the content and store it.
    } else {
      this.serviceLogger.warn(`No content fetched or error occurred for URL: ${url}`);
    }
    return content;
  }
}
