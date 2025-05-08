import { ingestDocument, IngestResponse } from './api';

const MOCK_API_BASE_URL = '/api';

// Mock the global fetch function
global.fetch = jest.fn();

// Simple mock for ReadableStream if not running in a browser-like environment
if (typeof ReadableStream === 'undefined') {
  global.ReadableStream = jest.fn().mockImplementation(() => ({
    // Add any methods that might be called on the stream by your code or libraries, e.g.:
    // getReader: jest.fn(),
    // cancel: jest.fn(),
  })) as jest.Mock;
}

describe('API Client', () => {
  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods: 
    (fetch as jest.Mock).mockClear();
    // Set the environment variable for testing consistency if your api.ts uses it
    process.env.NEXT_PUBLIC_API_BASE_URL = MOCK_API_BASE_URL;
  });

  describe('ingestDocument', () => {
    it('should successfully ingest a document', async () => {
      const mockUrl = 'http://example.com/doc.pdf';
      const mockSuccessResponse: IngestResponse = { jobId: '123', message: 'Ingestion started' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      });

      const result = await ingestDocument(mockUrl);

      expect(fetch).toHaveBeenCalledWith(`${MOCK_API_BASE_URL}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: mockUrl }),
      });
      expect(result).toEqual(mockSuccessResponse);
    });

    it('should handle API error during ingestion and return error message', async () => {
      const mockUrl = 'http://example.com/bad-doc.pdf';
      const mockErrorResponse = { message: 'Invalid URL format', error: 'Validation Error' };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => mockErrorResponse,
      });

      const result = await ingestDocument(mockUrl);
      
      expect(fetch).toHaveBeenCalledTimes(1);
      // The current implementation catches the error and returns an IngestResponse with error details
      expect(result.message).toBe(mockErrorResponse.message);
      expect(result.error).toBe(mockErrorResponse.message); // Error message is duplicated in current impl.
    });

    it('should handle network error during ingestion and return error message', async () => {
      const mockUrl = 'http://example.com/network-error.pdf';
      const networkError = new Error('Network failed');
      (fetch as jest.Mock).mockRejectedValueOnce(networkError);

      const result = await ingestDocument(mockUrl);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.message).toBe(networkError.message);
      expect(result.error).toBe(networkError.message);
    });

    it('should handle non-JSON error response during ingestion', async () => {
      const mockUrl = 'http://example.com/non-json-error.pdf';
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('Failed to parse JSON'); }, // Simulate JSON parsing failure
        statusText: 'Internal Server Error'
      });

      const result = await ingestDocument(mockUrl);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.message).toBe('HTTP error! status: 500');
      expect(result.error).toBe('HTTP error! status: 500');
    });
  });
});
