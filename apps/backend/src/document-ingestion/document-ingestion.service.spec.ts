import { Test, TestingModule } from '@nestjs/testing';
import { DocumentIngestionService } from './document-ingestion.service';
import { WeaviateService } from '../weaviate/weaviate.service';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@nestjs/common';
import { jest, describe, beforeEach, it, expect, afterEach } from '@jest/globals';

// Mock Weaviate client methods
const mockWeaviateClient = {
  data: {
    creator: jest.fn().mockReturnThis(),
    updater: jest.fn().mockReturnThis(),
    withClassName: jest.fn().mockReturnThis(),
    withId: jest.fn().mockReturnThis(),
    withObject: jest.fn().mockReturnThis(),
    do: jest.fn<() => Promise<any>>().mockResolvedValue(undefined), // Default successful 'do'
  },
};

// This will be the implementation for our Logger spies
const mockLogError = jest.fn();
const mockLog = jest.fn();
const mockLogWarn = jest.fn();
const mockLogDebug = jest.fn();

// Mock uuidv4 to return a predictable value
jest.mock('uuid', () => ({
  v4: jest.fn(),
}));
const mockJobId = 'mock-job-id';

describe('DocumentIngestionService', () => {
  let service: DocumentIngestionService;
  let weaviateService: WeaviateService;
  let loggerErrorSpy: any; // Using any for spy types
  let loggerLogSpy: any;
  let loggerWarnSpy: any;
  let loggerDebugSpy: any;

  beforeEach(async () => {
    // Reset mocks before each test
    mockWeaviateClient.data.creator.mockClear();
    mockWeaviateClient.data.updater.mockClear();
    mockWeaviateClient.data.withClassName.mockClear();
    mockWeaviateClient.data.withId.mockClear();
    mockWeaviateClient.data.withObject.mockClear();
    mockWeaviateClient.data.do.mockClear().mockResolvedValue(undefined); // Reset and set default successful 'do'
    (uuidv4 as any).mockClear(); // Clear uuid mock, reverted to any

    mockLogError.mockClear();
    mockLog.mockClear();
    mockLogWarn.mockClear();
    mockLogDebug.mockClear();

    // Spy on Logger methods using jest.spyOn, initialized in beforeEach
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(mockLogError);
    loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(mockLog);
    loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(mockLogWarn);
    loggerDebugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(mockLogDebug);

    // Typecast uuidv4 to any to bypass persistent Jest type issues
    (uuidv4 as any).mockReturnValue(mockJobId); // Reverted to any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentIngestionService,
        {
          provide: WeaviateService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockWeaviateClient),
            onModuleInit: jest.fn(), // Mock onModuleInit if it's called or relevant
          },
        },
        Logger, // Provide Logger itself, spies will attach to its prototype
      ],
    }).compile();

    service = module.get<DocumentIngestionService>(DocumentIngestionService);
    weaviateService = module.get<WeaviateService>(WeaviateService);
  });

  afterEach(() => {
    // Restore all spies after each test to avoid interference
    // jest.restoreAllMocks(); // This is broad, individual restoration is safer if spies are conditional
    if (loggerErrorSpy) loggerErrorSpy.mockRestore();
    if (loggerLogSpy) loggerLogSpy.mockRestore();
    if (loggerWarnSpy) loggerWarnSpy.mockRestore();
    if (loggerDebugSpy) loggerDebugSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startIngestion', () => {
    const testUrl = 'http://example.com/document.pdf';

    it('should successfully process an ingestion job and update status in Weaviate', async () => {
      mockWeaviateClient.data.do
        .mockResolvedValueOnce({
          id: mockJobId,
          properties: {},
          class: 'IngestJob',
        }) // create QUEUED job
        .mockResolvedValueOnce(undefined) // update to PROCESSING
        .mockResolvedValueOnce(undefined); // update to COMPLETED

      const result = await service.startIngestion(testUrl);

      expect(result).toEqual({ jobId: mockJobId });
      expect(weaviateService.getClient).toHaveBeenCalledTimes(1);
      expect(mockWeaviateClient.data.creator).toHaveBeenCalledTimes(1);
      expect(mockWeaviateClient.data.withId).toHaveBeenCalledWith(mockJobId);
      expect(mockWeaviateClient.data.withObject).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: mockJobId,
          status: 'QUEUED',
        }),
      );
      expect(mockWeaviateClient.data.updater).toHaveBeenCalledTimes(2);
      expect(mockWeaviateClient.data.withObject).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'COMPLETED',
        }),
      );
      expect(mockWeaviateClient.data.do).toHaveBeenCalledTimes(3);
      expect(mockLogError).not.toHaveBeenCalled(); // Ensure no errors were logged
    });

    it('should handle errors during Weaviate object creation and update status to FAILED', async () => {
      const errorMessage = 'Weaviate creator failed';
      mockWeaviateClient.data.do
        .mockRejectedValueOnce(new Error(errorMessage)) // Fail initial creation
        .mockResolvedValueOnce(undefined); // Successfully update to FAILED

      const result = await service.startIngestion(testUrl);

      expect(result).toEqual({ jobId: mockJobId });
      expect(mockWeaviateClient.data.updater).toHaveBeenCalledTimes(1); // Only the FAILED update
      expect(mockWeaviateClient.data.withObject).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FAILED',
          errorMessage: errorMessage,
        }),
      );
      expect(mockWeaviateClient.data.do).toHaveBeenCalledTimes(2); // Initial attempt + FAILED update
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining(
          `Error during ingestion process for job ${mockJobId}`,
        ),
        expect.any(Error),
      );
    });

    it('should handle errors during Weaviate status update and update status to FAILED', async () => {
      const errorMessage = 'Weaviate updater to PROCESSING failed';
      mockWeaviateClient.data.do
        .mockResolvedValueOnce({
          id: mockJobId,
          properties: {},
          class: 'IngestJob',
        }) // Create QUEUED job successfully
        .mockRejectedValueOnce(new Error(errorMessage)) // Fail update to PROCESSING
        .mockResolvedValueOnce(undefined); // Successfully update to FAILED

      const result = await service.startIngestion(testUrl);

      expect(result).toEqual({ jobId: mockJobId });
      expect(mockWeaviateClient.data.updater).toHaveBeenCalledTimes(2); // Attempt to PROCESSING, then to FAILED
      expect(mockWeaviateClient.data.withObject).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'FAILED',
          errorMessage: errorMessage,
        }),
      );
      expect(mockWeaviateClient.data.do).toHaveBeenCalledTimes(3); // Create + failed update + FAILED update
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining(
          `Error during ingestion process for job ${mockJobId}`,
        ),
        expect.any(Error),
      );
    });

    it('should handle errors even when updating to FAILED status fails', async () => {
      const initialError = new Error('Initial Weaviate error');
      const updateToFailedError = new Error('Failed to update to FAILED');

      mockWeaviateClient.data.do
        .mockRejectedValueOnce(initialError) // Initial operation fails
        .mockRejectedValueOnce(updateToFailedError); // Update to FAILED also fails

      const result = await service.startIngestion(testUrl);

      expect(result).toEqual({ jobId: mockJobId });
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining(
          `Error during ingestion process for job ${mockJobId}`,
        ),
        initialError,
      );
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining(
          `Failed to update IngestJob ${mockJobId} to FAILED`,
        ),
        updateToFailedError,
      );
    });
  });
});
