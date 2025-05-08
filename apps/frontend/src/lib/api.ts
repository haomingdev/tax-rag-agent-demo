// Define types for request/response payloads
export interface IngestRequestBody {
  url: string;
}

// Based on backend DocumentIngestionService.addIngestionJob response
export interface IngestResponse {
  jobId?: string;
  message: string;
  error?: string; // For client-side error wrapping
}

export interface ChatRequestBody {
  query: string;
  sessionId?: string;
}

// This represents the structure of the data field within an SSE MessageEvent
// from the /api/chat endpoint.
export type ChatServiceEventData =
  | { type: 'embedding_result'; success: boolean; error?: string }
  | { type: 'retrieved_context'; context: any[]; query?: string }
  | { type: 'llm_chunk'; content: string }
  | { 
      type: 'llm_sources'; 
      sources: { id: string; title: string; url: string; pageNumber?: number }[]; 
    }
  | { 
      type: 'llm_response'; // For non-streaming full response when no context is found
      content: string; 
      sources: { id: string; title: string; url: string; pageNumber?: number }[]; 
    }
  | { type: 'error'; message: string; details?: any };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

/**
 * Calls the backend to ingest a document from a given URL.
 * @param url The URL of the document to ingest.
 * @returns A promise that resolves to an IngestResponse object.
 */
export async function ingestDocument(url: string): Promise<IngestResponse> {
  const requestBody: IngestRequestBody = { url };
  try {
    const response = await fetch(`${API_BASE_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Try to parse JSON regardless of response.ok, as errors might also be JSON
    const responseData = await response.json().catch(() => null); 

    if (!response.ok) {
      const errorMessage = responseData?.message || responseData?.error || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }
    // Assuming successful response includes jobId and message as per backend
    return responseData as IngestResponse; 
  } catch (error) {
    console.error('Error during document ingestion:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown ingestion error';
    // Standardize error response for the caller
    return { message: errorMessage, error: errorMessage }; 
  }
}

/**
 * Initiates a chat request to the backend and returns a ReadableStream for Server-Sent Events.
 * The consumer of this stream will need to parse the SSE messages according to the MessageEvent spec.
 * Each SSE 'data' field will be a JSON string parsable into ChatServiceEventData.
 * 
 * @param query The user's chat query.
 * @param sessionId Optional session ID for maintaining chat context.
 * @returns A promise that resolves to a ReadableStream<Uint8Array> or null if an error occurs before establishing the stream.
 */
export async function streamChat(
  query: string,
  sessionId?: string,
): Promise<ReadableStream<Uint8Array> | null> {
  const requestBody: ChatRequestBody = { query, sessionId };
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream', // Crucial for SSE
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Attempt to parse error response from backend, fallback to status text
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null, cannot establish SSE stream.');
    }
    return response.body;

  } catch (error) {
    console.error('Error initiating chat stream:', error);
    return null; // Indicate failure to establish the stream
  }
}
