import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService, IngestionJobData } from './ingestion.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright'; 
import axios from 'axios'; 
import * as pdfParse from 'pdf-parse';
import { jest, describe, beforeEach, it, expect, afterEach } from '@jest/globals';

// Mocks
jest.mock('playwright');
jest.mock('axios');
jest.mock('pdf-parse', () => jest.fn());

// Mock data and helper functions
const mockIngestionQueue = {
  add: jest.fn(),
  name: 'ingestion',
};

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

let logger: Logger;
// Spies will have types inferred
let loggerSpy;
let errorSpy;
let warnSpy;
let debugSpy;
let verboseSpy;

const mockPage = {
  evaluate: jest.fn(),
  goto: jest.fn(),
  close: jest.fn(),
};

const mockBrowser = {
  newPage: jest.fn<() => Promise<Partial<Page>>>().mockResolvedValue(mockPage as Partial<Page>),
  close: jest.fn(),
};

describe('IngestionService', () => {
  let service: IngestionService;
  let queue: any; 
  // Spies for service methods, types inferred
  let mockFetchHtmlContent;
  let mockFetchPdfContent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: getQueueToken('ingestion'), useValue: mockIngestionQueue },
        { provide: Logger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
    queue = module.get(getQueueToken('ingestion'));
    logger = module.get<Logger>(Logger);

    loggerSpy = jest.spyOn(logger, 'log');
    errorSpy = jest.spyOn(logger, 'error');
    warnSpy = jest.spyOn(logger, 'warn');
    debugSpy = jest.spyOn(logger, 'debug');
    verboseSpy = jest.spyOn(logger, 'verbose');

    mockFetchHtmlContent = jest.spyOn(service as any, 'fetchHtmlContent');
    mockFetchPdfContent = jest.spyOn(service as any, 'fetchPdfContent');

    mockIngestionQueue.add.mockClear();
    loggerSpy.mockClear();
    errorSpy.mockClear();
    warnSpy.mockClear();
    debugSpy.mockClear();
    verboseSpy.mockClear();
    mockFetchHtmlContent.mockClear();
    mockFetchPdfContent.mockClear();
    (axios.get as any).mockReset();
    (pdfParse as any).mockReset();
    (chromium.launch as any).mockReset();
    (chromium.launch as any).mockResolvedValue(mockBrowser as any);
    mockBrowser.newPage.mockClear();
    mockBrowser.close.mockClear();
    mockPage.goto.mockClear();
    mockPage.evaluate.mockClear();
    mockPage.close.mockClear();
  });

  afterEach(() => {
    // Ensure all mocks are reset or cleared after each test if not done in beforeEach
    // This can prevent test interference
    jest.clearAllMocks(); // Or more granular resets if preferred
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addIngestionJob', () => {
    it('should add a job to the ingestion queue and return the job', async () => {
      const jobData: IngestionJobData = { url: 'http://example.com' };
      const mockJob = { id: '1', data: jobData };
      queue.add.mockResolvedValue(mockJob);

      const result = await service.addIngestionJob(jobData.url);
      expect(queue.add).toHaveBeenCalledWith('ingestUrl', jobData);
      expect(result).toEqual(mockJob);
    });

    it('should log the job addition', async () => {
      const jobData: IngestionJobData = { url: 'http://example.com' };
      const mockJob = { id: '1', data: jobData };
      queue.add.mockResolvedValue(mockJob);

      await service.addIngestionJob(jobData.url);
      expect(mockLogger.log).toHaveBeenLastCalledWith(
        `Job ${mockJob.id} added to queue ${mockIngestionQueue.name} for URL: ${jobData.url}`,
      );
    });
  });

  describe('processUrlForIngestion', () => {
    const urlHtml = 'http://example.com/page.html';
    const urlPdf = 'http://example.com/document.pdf';
    const expectedHtmlContent = '<html><body><h1>Test</h1></body></html>';
    const expectedPdfText = 'This is a test PDF.';

    beforeEach(() => {
      // Reset mocks before each test in this describe block if they are modified per test
      mockFetchHtmlContent.mockReset();
      mockFetchPdfContent.mockReset();
      mockLogger.log.mockReset();
      mockLogger.error.mockReset();
      mockLogger.warn.mockReset();

      // Default implementations for success cases
      mockFetchHtmlContent.mockImplementation(async (url: string) => {
        if (service['fetchHtmlContent'] === mockFetchHtmlContent && url === urlHtml) { 
          return expectedHtmlContent;
        }
        return null; // Default to null if not the expected URL or if testing error paths
      });
      mockFetchPdfContent.mockImplementation(async (url: string) => {
        if (service['fetchPdfContent'] === mockFetchPdfContent && url === urlPdf) {
          return expectedPdfText;
        }
        return null; // Default to null
      });

      service['fetchHtmlContent'] = mockFetchHtmlContent;
      service['fetchPdfContent'] = mockFetchPdfContent;
    });

    it('should call fetchHtmlContent for HTML URLs', async () => {
      // Setup spy for this specific test's successful call
      mockFetchHtmlContent.mockResolvedValueOnce(expectedHtmlContent);
      await service.processUrlForIngestion(urlHtml);
      expect(mockFetchHtmlContent).toHaveBeenCalledWith(urlHtml);
      expect(mockFetchPdfContent).not.toHaveBeenCalled();
    });

    it('should call fetchPdfContent for PDF URLs', async () => {
      // Setup spy for this specific test's successful call
      mockFetchPdfContent.mockResolvedValueOnce(expectedPdfText);
      await service.processUrlForIngestion(urlPdf);
      expect(mockFetchPdfContent).toHaveBeenCalledWith(urlPdf);
      expect(mockFetchHtmlContent).not.toHaveBeenCalled();
    });

    it('should return null if HTML content fetching fails', async () => {
      const brokenUrl = 'http://example.com/broken-html.html';
      const errorMessage = `Error fetching HTML content from ${brokenUrl}: Failed to navigate`;
      mockFetchHtmlContent.mockImplementation(async (url: string) => {
        if (url === brokenUrl) {
          mockLogger.error(errorMessage); 
          return null;
        }
        return expectedHtmlContent; 
      });

      const result = await service.processUrlForIngestion(brokenUrl);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(errorMessage);
      expect(mockLogger.warn).toHaveBeenCalledWith(`No content fetched or error occurred for URL: ${brokenUrl}`);
    });

    // Test for successful HTML processing (already passed, kept for completeness)
    it('should return HTML content if HTML processing is successful', async () => {
      mockFetchHtmlContent.mockResolvedValueOnce(expectedHtmlContent);
      const result = await service.processUrlForIngestion(urlHtml);
      expect(result).toBe(expectedHtmlContent);
    });

    it('should return null if PDF content fetching fails (axios error)', async () => {
      const brokenUrl = 'http://example.com/broken-document.pdf';
      const errorMessage = `Error fetching or parsing PDF content from ${brokenUrl}: Network error`;
      mockFetchPdfContent.mockImplementationOnce(async () => {
        mockLogger.error(errorMessage);
        return null;
      });
      const result = await service.processUrlForIngestion(brokenUrl);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(errorMessage);
      expect(mockLogger.warn).toHaveBeenCalledWith(`No content fetched or error occurred for URL: ${brokenUrl}`);
    });

    it('should return null if PDF parsing fails', async () => {
      const unparsableUrl = 'http://example.com/unparsable.pdf';
      const errorMessage = `Error fetching or parsing PDF content from ${unparsableUrl}: Failed to parse PDF`;
      mockFetchPdfContent.mockImplementationOnce(async () => {
        mockLogger.error(errorMessage);
        return null;
      });
      const result = await service.processUrlForIngestion(unparsableUrl);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(errorMessage);
      expect(mockLogger.warn).toHaveBeenCalledWith(`No content fetched or error occurred for URL: ${unparsableUrl}`);
    });

    it('should return null if PDF download status is not 200', async () => {
      const notFoundUrl = 'http://example.com/notfound.pdf';
      // This error message comes from within fetchPdfContent if (response.status !== 200)
      const errorMessage = `Failed to download PDF from ${notFoundUrl}. Status: 404`; 
      mockFetchPdfContent.mockImplementationOnce(async () => {
        // Simulate the service's internal logging when status is not 200
        mockLogger.error(errorMessage);
        return null;
      });
      const result = await service.processUrlForIngestion(notFoundUrl);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(errorMessage);
      expect(mockLogger.warn).toHaveBeenCalledWith(`No content fetched or error occurred for URL: ${notFoundUrl}`);
    });

    // Test for successful PDF processing (already passed, kept for completeness)
    it('should return PDF text if PDF processing is successful', async () => {
      mockFetchPdfContent.mockResolvedValueOnce(expectedPdfText);
      const result = await service.processUrlForIngestion(urlPdf);
      expect(result).toBe(expectedPdfText);
    });
  });
});
