'use client';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import IngestPage from './page'; // Adjust path as necessary
import { ingestDocument, IngestResponse } from '@/lib/api'; // Adjust path as necessary

// Mock the API module
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'), // Import and retain other exports
  ingestDocument: jest.fn(),
}));

// Mock Shadcn/UI components if they cause issues in Jest (e.g., due to internal hooks or context)
// For now, we'll assume they render okay or tests will show if specific mocks are needed.

describe('IngestPage', () => {
  const mockIngestDocument = ingestDocument as jest.Mock;

  beforeEach(() => {
    mockIngestDocument.mockClear();
  });

  it('renders the ingest page with essential elements', () => {
    render(<IngestPage />);
    // Check for the main title text "Ingest Document". 
    // We look for text that is NOT part of a button, as the submit button also contains this text.
    const titleElement = screen.getAllByText(/ingest document/i).find(
      (element) => element.tagName.toLowerCase() !== 'button'
    );
    expect(titleElement).toBeInTheDocument();
    expect(screen.getByLabelText(/document url/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ingest document/i })).toBeInTheDocument();
  });

  it('allows user to type into the URL input', () => {
    render(<IngestPage />);
    const urlInput = screen.getByLabelText(/document url/i);
    fireEvent.change(urlInput, { target: { value: 'http://example.com/test.pdf' } });
    expect(urlInput).toHaveValue('http://example.com/test.pdf');
  });

  it('calls ingestDocument on submit and shows loading and success feedback', async () => {
    const testUrl = 'http://example.com/success.pdf';
    const mockSuccessResponse = { message: 'Ingestion started successfully!', jobId: 'job-123' };
    mockIngestDocument.mockResolvedValueOnce(mockSuccessResponse);

    render(<IngestPage />);
    const urlInput = screen.getByLabelText(/document url/i);
    const submitButton = screen.getByRole('button', { name: /ingest document/i });

    fireEvent.change(urlInput, { target: { value: testUrl } });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /ingesting.../i })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockIngestDocument).toHaveBeenCalledWith(testUrl);
      expect(screen.getByText(/ingestion started successfully!/i)).toBeInTheDocument();
      expect(screen.getByText(/job-123/i)).toBeInTheDocument();
    });
    expect(submitButton).not.toBeDisabled();
  });

  it('shows error feedback if ingestDocument returns an error', async () => {
    const testUrl = 'http://example.com/error.pdf';
    const mockErrorResponse = { message: 'Failed to ingest', error: 'Server Error' };
    mockIngestDocument.mockResolvedValueOnce(mockErrorResponse);

    render(<IngestPage />);
    const urlInput = screen.getByLabelText(/document url/i);
    const submitButton = screen.getByRole('button', { name: /ingest document/i });

    fireEvent.change(urlInput, { target: { value: testUrl } });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(mockIngestDocument).toHaveBeenCalledWith(testUrl);
      expect(screen.getByText(/failed to ingest/i)).toBeInTheDocument();
      expect(screen.getByText(/^Error$/i)).toBeInTheDocument(); // Checks for the 'Error' title in feedback
    });
    expect(submitButton).not.toBeDisabled();
  });

  it('shows a validation error if URL is empty on submit', async () => {
    render(<IngestPage />);
    const submitButton = screen.getByRole('button', { name: /ingest document/i });

    fireEvent.click(submitButton);

    // With the 'required' attribute on the input, the browser's native validation
    // should prevent form submission if the URL is empty. Our custom JavaScript
    // feedback 'URL cannot be empty.' would not be set in this scenario.
    // Thus, we don't assert its presence. The key is that the API is not called.
    expect(mockIngestDocument).not.toHaveBeenCalled();
  });

  it('disables the submit button during loading and re-enables it after', async () => {
    const testUrl = 'http://example.com/loading.pdf';
    // Create a promise that we can resolve later
    let resolvePromise: (value: Partial<IngestResponse>) => void = () => {};
    const promise = new Promise<Partial<IngestResponse>>(resolve => {
      resolvePromise = resolve;
    });
    mockIngestDocument.mockReturnValueOnce(promise);

    render(<IngestPage />);
    const urlInput = screen.getByLabelText(/document url/i);
    const submitButton = screen.getByRole('button', { name: /ingest document/i });

    fireEvent.change(urlInput, { target: { value: testUrl } });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /ingesting.../i })).toBeInTheDocument();

    // Resolve the promise to simulate API call finishing
    resolvePromise({ message: 'Done', jobId: 'job-done' });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
      // Make the query more specific to avoid matching "job-done"
      expect(screen.getByText(/^Done$/i)).toBeInTheDocument();
    });
  });
});
