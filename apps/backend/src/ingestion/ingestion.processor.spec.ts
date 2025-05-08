import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionService, IngestionJobData } from './ingestion.service';
import { createMock } from '@golevelup/ts-jest';

// Mock the IngestionService
const mockIngestionService = {
  processUrlForIngestion: jest.fn(),
};

// Mock the Logger
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  setContext: jest.fn(), // Though not used in the refactored processor, keep if base Logger type needs it
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

describe('IngestionProcessor', () => {
  let processor: IngestionProcessor;

  beforeEach(async () => {
    // Reset mocks before each test
    mockIngestionService.processUrlForIngestion.mockReset();
    mockLogger.log.mockReset();
    mockLogger.error.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionProcessor,
        { provide: IngestionService, useValue: mockIngestionService },
        // { provide: Logger, useValue: mockLogger }, // Logger is now instantiated directly
      ],
    })
    // Override logger after module creation to ensure our mock is used by the instance
    .overrideProvider(Logger)
    .useValue(mockLogger)
    .compile();

    processor = module.get<IngestionProcessor>(IngestionProcessor);
    // Explicitly set the logger instance inside the processor to our mock for this test suite
    (processor as any).logger = mockLogger; 
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleIngestion', () => {
    const mockJobData: IngestionJobData = {
      url: 'http://example.com',
      weaviateJobId: 'test-job-id',
    };
    const mockJob = createMock<Job<IngestionJobData>>({
      id: '123',
      name: 'ingestUrl',
      data: mockJobData,
    });

    it('should call ingestionService.processUrlForIngestion with job data and log success', async () => {
      mockIngestionService.processUrlForIngestion.mockResolvedValue(undefined);

      await processor.handleIngestion(mockJob);

      expect(mockIngestionService.processUrlForIngestion).toHaveBeenCalledWith(mockJobData);
      expect(mockLogger.log).toHaveBeenCalledWith(
        `Processing job ${mockJob.id} of type ${mockJob.name} with data: ${JSON.stringify(mockJob.data)} for queue ingestion`,
      );
      expect(mockLogger.log).toHaveBeenCalledWith(`Job ${mockJob.id} completed successfully.`);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log an error and rethrow if ingestionService.processUrlForIngestion fails', async () => {
      const errorMessage = 'Processing failed';
      const expectedError = new Error(errorMessage);
      mockIngestionService.processUrlForIngestion.mockRejectedValue(expectedError);

      await expect(processor.handleIngestion(mockJob)).rejects.toThrow(expectedError);

      expect(mockIngestionService.processUrlForIngestion).toHaveBeenCalledWith(mockJobData);
      expect(mockLogger.log).toHaveBeenCalledWith(
        `Processing job ${mockJob.id} of type ${mockJob.name} with data: ${JSON.stringify(mockJob.data)} for queue ingestion`,
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Job ${mockJob.id} failed with error: ${errorMessage}`,
        expectedError.stack,
      );
    });
  });
});
