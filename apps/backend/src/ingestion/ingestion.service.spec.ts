import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService, IngestionJobData } from './ingestion.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import axios from 'axios'; 
import * as pdfParse from 'pdf-parse';
import { jest, describe, beforeEach, it, expect, afterEach, beforeAll } from '@jest/globals'; 
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { INGESTION_QUEUE_NAME } from './ingestion.module';
import { WeaviateService } from '../weaviate/weaviate.service';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'; 
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'; // Import for mocking

// Mock constants from ingestion.module
jest.mock('./ingestion.module', () => { 
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const actualModule = jest.requireActual('./ingestion.module') as typeof import('./ingestion.module');
  return {
    __esModule: true, 
    IngestionModule: actualModule.IngestionModule, // Preserve the IngestionModule class
    // If there are other named exports from ingestion.module.ts that tests might depend on,
    // they should be explicitly listed here too, e.g.:
    // AnotherExportedThing: actualModule.AnotherExportedThing,
    INGESTION_QUEUE_NAME: 'test-ingestion-queue', // Mocked value, overrides actual
  };
});

// Mocks for external dependencies
const mockAxiosGet = axios.get as jest.Mock;
const mockPdfParse = pdfParse as unknown as jest.Mock;

// Mock for @langchain/textsplitters
const mockSplitTextFn = jest.fn();
jest.mock('@langchain/textsplitters', () => ({
  RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => ({
    splitText: mockSplitTextFn,
  })),
}));

// Mock for @langchain/google-genai
const mockEmbedDocuments: jest.MockedFunction<(chunks: string[]) => Promise<number[][]>> = jest.fn(); // Correct typing for jest.MockedFunction
jest.mock('@langchain/google-genai', () => ({
  GoogleGenerativeAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedDocuments: mockEmbedDocuments, // Use the same mock function here
  })),
}));

jest.mock('axios');
jest.mock('pdf-parse', () => jest.fn());

describe('IngestionService', () => {
  let service: IngestionService;
  let mockLogger: { // Declare with let here
    log: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
    setLogLevels: jest.Mock;
  };
  let mockIngestionQueue: {
    add: jest.MockedFunction<(...args: any[]) => any>;
    getJob: jest.MockedFunction<(...args: any[]) => any>;
    name: string; // Add name property
  };

  // Mocks for playwright browser and page interactions - simplified
  const mockPage = {
    goto: jest.fn(),
    evaluate: jest.fn(),
    content: jest.fn(), 
    route: jest.fn(),   
    close: jest.fn(),
  };
  const mockBrowser = {
    newPage: jest.fn<() => Promise<Partial<any>>>().mockResolvedValue(mockPage as Partial<any>),
    close: jest.fn(),
  };

  // Spies on service's own methods
  let mockFetchHtmlContent: any;
  let mockFetchPdfContent: any;

  let mockConfigService: {
    get: jest.Mock;
  };

  beforeAll(async () => {
    // Mock chromium launch globally for the service constructor if it runs onModuleInit
    // This needs to be handled carefully if playwright is truly optional or only for HTML
    // For now, we assume IngestionService might try to init browser, so we provide a mock.
    // The actual 'chromium' import from 'playwright' is not used directly in tests now.
  });

  beforeEach(async () => {
    // Reset static mocks that might have state from other tests if not careful
    mockAxiosGet.mockReset();
    mockPdfParse.mockReset();
    mockSplitTextFn.mockReset(); 

    // Initialize/Reset mockLogger for each test
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      setLogLevels: jest.fn(),
    };

    mockConfigService = { 
      get: jest.fn(),
    };

    const MockGoogleGenerativeAIEmbeddings = GoogleGenerativeAIEmbeddings as jest.MockedClass<typeof GoogleGenerativeAIEmbeddings>;
    MockGoogleGenerativeAIEmbeddings.mockClear();
    mockEmbedDocuments.mockClear();
    (GoogleGenerativeAIEmbeddings as any).mockImplementation(() => ({
        embedDocuments: mockEmbedDocuments,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        {
          provide: getQueueToken(INGESTION_QUEUE_NAME),
          useValue: {
            add: jest.fn(),
            getJob: jest.fn(),
            name: INGESTION_QUEUE_NAME, // Initialize with the (mocked) queue name
          },
        },
        {
          provide: Logger,
          useValue: mockLogger, // Use the mockLogger instance that's (re)initialized each time
        },
        {
          provide: ConfigService,
          useValue: mockConfigService, 
        },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
    // Manually inject the mocked browser into the service instance after it's created
    // This simulates the behavior of onModuleInit without actually calling playwright.chromium.launch
    service['browser'] = mockBrowser as any; 

    mockIngestionQueue = module.get(getQueueToken(INGESTION_QUEUE_NAME));

    // Spy on private methods AFTER service instance is created
    mockFetchHtmlContent = jest.spyOn(service as any, 'fetchHtmlContent');
    mockFetchPdfContent = jest.spyOn(service as any, 'fetchPdfContent');

    // Reset logger mocks
    mockLogger.log.mockClear();
    mockLogger.error.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.debug.mockClear();
    mockLogger.verbose.mockClear();

    // Reset spies and other mocks
    mockFetchHtmlContent.mockClear();
    mockFetchPdfContent.mockClear();

    (mockBrowser.newPage as any).mockClear();
    (mockBrowser.close as any).mockClear();
    mockPage.goto.mockClear();
    mockPage.evaluate.mockClear();
    mockPage.content.mockClear();
    mockPage.route.mockClear();
    mockPage.close.mockClear();
    mockIngestionQueue.add.mockClear();

    // Default mock for ConfigService.get to return a dummy API key
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'GEMINI_API_KEY') {
        return 'test-api-key';
      }
      return undefined;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks(); 
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- Tests for generateEmbeddings ---
  describe('generateEmbeddings', () => {
    const testChunks = ['chunk1 content', 'chunk2 content'];
    const mockGeneratedEmbeddings = [[0.1, 0.2], [0.3, 0.4]];

    it('should generate embeddings successfully when API key is present', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');
      mockEmbedDocuments.mockResolvedValue(mockGeneratedEmbeddings);

      const result = await (service as any).generateEmbeddings(testChunks);

      expect(mockConfigService.get).toHaveBeenCalledWith('GEMINI_API_KEY');
      expect(GoogleGenerativeAIEmbeddings).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        model: 'models/text-embedding-004',
      });
      expect(mockEmbedDocuments).toHaveBeenCalledWith(testChunks);
      expect(result).toEqual(mockGeneratedEmbeddings);
      expect(mockLogger.log).toHaveBeenCalledWith(`Successfully generated ${testChunks.length} embeddings.`);
      expect(mockLogger.log).toHaveBeenCalledWith(`First embedding dimension: ${mockGeneratedEmbeddings[0].length}`);
    });

    it('should return null and log error if GEMINI_API_KEY is not configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => (key === 'GEMINI_API_KEY' ? undefined : 'other_value'));

      const result = await (service as any).generateEmbeddings(testChunks);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('GEMINI_API_KEY is not configured. Cannot generate embeddings.');
      expect(GoogleGenerativeAIEmbeddings).not.toHaveBeenCalled();
      expect(mockEmbedDocuments).not.toHaveBeenCalled();
    });

    it('should return null and log error if embedding generation API call fails', async () => {
      const apiError = new Error('Embedding API Failed');
      mockConfigService.get.mockReturnValue('test-api-key');
      mockEmbedDocuments.mockRejectedValue(apiError);

      const result = await (service as any).generateEmbeddings(testChunks);

      expect(result).toBeNull();
      expect(GoogleGenerativeAIEmbeddings).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        model: 'models/text-embedding-004',
      });
      expect(mockEmbedDocuments).toHaveBeenCalledWith(testChunks);
      expect(mockLogger.error).toHaveBeenCalledWith(`Error generating embeddings: ${apiError.message}`, apiError.stack);
    });

    it('should return an empty array and log if input chunks array is empty', async () => {
      const result = await (service as any).generateEmbeddings([]);

      expect(result).toEqual([]);
      expect(mockLogger.log).toHaveBeenCalledWith('No chunks provided to generate embeddings.');
      expect(GoogleGenerativeAIEmbeddings).not.toHaveBeenCalled();
      expect(mockEmbedDocuments).not.toHaveBeenCalled();
    });

    it('should handle null input for chunks gracefully (treat as empty)', async () => {
      // Explicitly testing null, though TypeScript types might prevent this from IngestionService callers
      const result = await (service as any).generateEmbeddings(null as any);

      expect(result).toEqual([]); // Assuming it treats null as empty based on implementation check: `if (!chunks || chunks.length === 0)`
      expect(mockLogger.log).toHaveBeenCalledWith('No chunks provided to generate embeddings.');
      expect(GoogleGenerativeAIEmbeddings).not.toHaveBeenCalled();
      expect(mockEmbedDocuments).not.toHaveBeenCalled();
    });
  });

  describe('addIngestionJob', () => {
    it('should add a job to the ingestion queue and return the job', async () => {
      const jobData: IngestionJobData = { url: 'http://example.com' };
      const mockJob = { id: '1', data: jobData, name: INGESTION_QUEUE_NAME }; // ensure mockJob also has a name if service relies on it
      mockIngestionQueue.add.mockImplementationOnce(() => Promise.resolve(mockJob));

      const result = await service.addIngestionJob(jobData.url);
      expect(mockIngestionQueue.add).toHaveBeenCalledWith('ingestUrl', jobData);
      expect(result).toEqual(mockJob);
    });

    it('should log the job addition', async () => {
      const jobData: IngestionJobData = { url: 'http://example.com' };
      const mockJob = { id: '1', data: jobData, name: INGESTION_QUEUE_NAME }; // ensure mockJob also has a name if service relies on it
      mockIngestionQueue.add.mockImplementationOnce(() => Promise.resolve(mockJob));

      await service.addIngestionJob(jobData.url);
      expect(mockLogger.log).toHaveBeenLastCalledWith(
        `Job ${mockJob.id} added to queue ${INGESTION_QUEUE_NAME} for URL: ${jobData.url}`,
      );
    });
  });

  describe('processUrlForIngestion', () => {
    const testUrl = 'http://example.com';
    const testHtmlContent = '<html><body><h1>Title</h1><p>Content</p></body></html>';
    const testCleanedContent = 'Title Content';
    const testPdfText = 'PDF text content';
    const testChunks = ['chunk1', 'chunk2'];
    const testEmbeddings = [[0.1], [0.2]];

    // To store spy instances for restoration
    let fetchHtmlContentSpy: jest.SpiedFunction<any>;
    let fetchPdfContentSpy: jest.SpiedFunction<any>;
    let cleanHtmlSpy: jest.SpiedFunction<any>;
    let chunkTextSpy: jest.SpiedFunction<any>;
    let generateEmbeddingsSpy: jest.SpiedFunction<any>;

    beforeEach(() => {
      // Spy on and mock private methods for these tests
      // Need to cast to `any` to spy on private methods
      fetchHtmlContentSpy = jest.spyOn(service as any, 'fetchHtmlContent').mockResolvedValue(testHtmlContent);
      fetchPdfContentSpy = jest.spyOn(service as any, 'fetchPdfContent').mockResolvedValue(testPdfText);
      cleanHtmlSpy = jest.spyOn(service as any, 'cleanHtml').mockResolvedValue(testCleanedContent);
      chunkTextSpy = jest.spyOn(service as any, 'chunkText').mockResolvedValue(testChunks);
      // Mock generateEmbeddings by default to succeed
      generateEmbeddingsSpy = jest.spyOn(service as any, 'generateEmbeddings').mockResolvedValue(testEmbeddings);
    });

    afterEach(() => {
      // Restore all spies created in this block's beforeEach to prevent interference
      fetchHtmlContentSpy.mockRestore();
      fetchPdfContentSpy.mockRestore();
      cleanHtmlSpy.mockRestore();
      chunkTextSpy.mockRestore();
      generateEmbeddingsSpy.mockRestore();
    });

    it('should process HTML URL, chunk text, generate embeddings, and log success', async () => {
      const result = await service.processUrlForIngestion(testUrl);

      expect((service as any).fetchHtmlContent).toHaveBeenCalledWith(testUrl);
      expect((service as any).cleanHtml).toHaveBeenCalledWith(testHtmlContent, testUrl);
      expect((service as any).chunkText).toHaveBeenCalledWith(testCleanedContent);
      expect((service as any).generateEmbeddings).toHaveBeenCalledWith(testChunks);
      expect(mockLogger.log).toHaveBeenCalledWith(`Successfully cleaned text for URL: ${testUrl}. Length: ${testCleanedContent.length}`);
      expect(mockLogger.log).toHaveBeenCalledWith(`Generated ${testChunks.length} chunks for URL: ${testUrl}. First chunk: "${testChunks[0].substring(0,100)}..."`);
      expect(mockLogger.log).toHaveBeenCalledWith(`Embeddings generated for ${testUrl}. Count: ${testEmbeddings.length}.`);
      // The return value is currently the cleaned text, this might change
      expect(result).toEqual(testCleanedContent);
    });

    it('should process PDF URL, chunk text, generate embeddings, and log success', async () => {
      const pdfUrl = 'http://example.com/doc.pdf';
      jest.spyOn(service as any, 'fetchHtmlContent'); // Ensure it's not called

      const result = await service.processUrlForIngestion(pdfUrl);

      expect((service as any).fetchPdfContent).toHaveBeenCalledWith(pdfUrl);
      expect((service as any).fetchHtmlContent).not.toHaveBeenCalled();
      expect((service as any).cleanHtml).not.toHaveBeenCalled(); // cleanHtml is for HTML
      expect((service as any).chunkText).toHaveBeenCalledWith(testPdfText); // PDF text is used directly
      expect((service as any).generateEmbeddings).toHaveBeenCalledWith(testChunks); // Assuming chunkText returns testChunks for PDF too
      expect(mockLogger.log).toHaveBeenCalledWith(`Embeddings generated for ${pdfUrl}. Count: ${testEmbeddings.length}.`);
      expect(result).toEqual(testPdfText);
    });

    it('should return null and log error if fetching content fails', async () => {
      (service as any).fetchHtmlContent.mockResolvedValue(null);
      const result = await service.processUrlForIngestion(testUrl);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(`No content could be cleaned or fetched for URL: ${testUrl}`);
      expect((service as any).generateEmbeddings).not.toHaveBeenCalled(); // Should not proceed to embeddings
    });

    it('should return null and log error if text cleaning fails', async () => {
      (service as any).cleanHtml.mockResolvedValue(null);
      const result = await service.processUrlForIngestion(testUrl);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(`No content could be cleaned or fetched for URL: ${testUrl}`);
      expect((service as any).generateEmbeddings).not.toHaveBeenCalled();
    });

    it('should return null and log error if chunking fails (returns no chunks)', async () => {
      (service as any).chunkText.mockResolvedValue([]); // Simulate no chunks
      const result = await service.processUrlForIngestion(testUrl);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(`No chunks were generated for URL: ${testUrl}. Aborting further processing.`);
      expect((service as any).generateEmbeddings).not.toHaveBeenCalled();
    });

    it('should return null and log error if embedding generation fails', async () => {
      (service as any).generateEmbeddings.mockResolvedValue(null); // Simulate embedding failure
      const result = await service.processUrlForIngestion(testUrl);

      expect((service as any).chunkText).toHaveBeenCalledWith(testCleanedContent);
      expect((service as any).generateEmbeddings).toHaveBeenCalledWith(testChunks);
      expect(mockLogger.warn).toHaveBeenCalledWith(`Failed to generate embeddings for URL: ${testUrl}.`);
      expect(result).toBeNull();
    });

    // Test cases for chunkText method itself (already exist and are passing)
    // These ensure chunkText's own logic (like error handling, empty input) is correct.
    // The tests above ensure processUrlForIngestion integrates with chunkText's outcomes.

    // Test case for HTML content where @extractus/article-extractor fails or returns no content
    it('should handle HTML URL where article extraction returns null', async () => {
      (service as any).cleanHtml.mockResolvedValue(null); // Simulate extraction failure
      const result = await service.processUrlForIngestion(testUrl);
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(`No content could be cleaned or fetched for URL: ${testUrl}`);
      expect((service as any).generateEmbeddings).not.toHaveBeenCalled();
    });


    // Original error simulation tests for HTML/PDF fetching can be kept or adapted
    // They primarily test the logger calls within those specific error paths
    // The existing tests from earlier steps for processUrlForIngestion's direct error handling are valuable.
    // Example: if fetchHtmlContent itself logs an error using serviceLogger.error

    describe('Original error handling tests for content fetching and parsing in processUrlForIngestion', () => {
      const brokenUrl = 'http://broken.url';
      const unparsableUrl = 'http://unparsable.pdf';
      const notFoundUrl = 'http://notfound.pdf';

      beforeEach(() => {
        // Reset spies on private methods for these specific sub-tests to avoid interference
        // and allow testing their direct error output (e.g., logger calls within them)
        // OR, for these tests, don't spy on them but mock their dependencies if needed.
        // For now, we'll re-mock the top-level method behavior to simulate specific failures.
        
        // Reset generateEmbeddings to success by default for these sub-tests, unless testing its failure
        jest.spyOn(service as any, 'generateEmbeddings').mockResolvedValue(testEmbeddings);
      });

      it('should return null if HTML content fetching fails (simulated by fetchHtmlContent)', async () => {
        (service as any).fetchHtmlContent.mockImplementationOnce(async () => {
          // Simulate the internal error log of fetchHtmlContent if needed, or just return null
          // For this integration test, just ensuring processUrlForIngestion handles the null return correctly.
          return null;
        });

        const result = await service.processUrlForIngestion(brokenUrl);
        expect(result).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalledWith(`No content could be cleaned or fetched for URL: ${brokenUrl}`);
        expect((service as any).generateEmbeddings).not.toHaveBeenCalled();
      });

      it('should return null if PDF content fetching fails (simulated by fetchPdfContent)', async () => {
        (service as any).fetchPdfContent.mockImplementationOnce(async () => {
          return null;
        });

        const result = await service.processUrlForIngestion(unparsableUrl);
        expect(result).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalledWith(`No content could be cleaned or fetched for URL: ${unparsableUrl}`);
        expect((service as any).generateEmbeddings).not.toHaveBeenCalled();
      });
    });

  });

  describe('chunkText (existing tests - confirmed passing)', () => {
    const longText = 'This is a very long string that is intended to be split into multiple chunks. '.repeat(20);
    const shortText = 'This is a short string.';

    beforeEach(() => {
      // Reset mocks specifically for this describe block if needed, e.g., mockSplitTextFn
      mockSplitTextFn.mockReset();
      // Default behavior for successful splitting (can be overridden)
      mockSplitTextFn.mockImplementation(async (text: string) => {
        if (text === longText) return [text.substring(0, 1000), text.substring(900)]; 
        if (text === shortText) return [shortText]; 
        if (!text || text.trim() === '') return [];
        return [text]; 
      });
      mockLogger.log.mockClear();
      mockLogger.warn.mockClear();
      mockLogger.error.mockClear();
      mockLogger.debug.mockClear();
    });

    it('should split a long text into multiple chunks', async () => {
      // Ensure mock returns multiple chunks for longText
      mockSplitTextFn.mockImplementationOnce(() => Promise.resolve([longText.substring(0,1000), longText.substring(900, 1900)]));
      const chunks = await (service as any).chunkText(longText);
      expect(chunks.length).toBeGreaterThan(1);
      expect(mockSplitTextFn).toHaveBeenCalledWith(longText);
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining(`Successfully split text into ${chunks.length} chunks.`));
      expect(chunks[0].length).toBeLessThanOrEqual(1000); 
    });

    it('should return a single chunk if text is shorter than chunkSize', async () => {
      mockSplitTextFn.mockImplementationOnce(() => Promise.resolve([shortText])); // Ensure it returns a single chunk
      const chunks = await (service as any).chunkText(shortText);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual(shortText);
      expect(mockSplitTextFn).toHaveBeenCalledWith(shortText);
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Successfully split text into 1 chunks.'));
    });

    it('should return an empty array for empty string input and log a warning', async () => {
      const chunks = await (service as any).chunkText('');
      expect(chunks).toEqual([]);
      expect(mockSplitTextFn).not.toHaveBeenCalled(); 
      expect(mockLogger.log).toHaveBeenCalledWith('Text input is empty or whitespace, returning no chunks.');
    });

    it('should return an empty array for whitespace-only string input and log a warning', async () => {
      const chunks = await (service as any).chunkText('   ');
      expect(chunks).toEqual([]);
      expect(mockSplitTextFn).not.toHaveBeenCalled(); 
      expect(mockLogger.log).toHaveBeenCalledWith('Text input is empty or whitespace, returning no chunks.');
    });

    it('should handle errors from splitter.splitText, log error, and return an empty array', async () => {
      const error = new Error('Internal Splitter Error');
      // Ensure this specific mock is used for this test
      mockSplitTextFn.mockImplementationOnce(() => Promise.reject(error));

      const chunks = await (service as any).chunkText(longText); 
      
      expect(chunks).toEqual([]);
      expect(mockSplitTextFn).toHaveBeenCalledWith(longText);
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Error during text chunking: ${error.message}`,
        error.stack,
      );
    });
  });

}); // END OF describe('IngestionService', ...)
