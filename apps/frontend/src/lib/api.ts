// Define types for request/response payloads
export interface IngestRequestBody {
  url: string
}

// Based on backend DocumentIngestionService.addIngestionJob response
export interface IngestResponse {
  jobId?: string
  message: string
  error?: string // For client-side error wrapping
}

export interface ChatRequestBody {
  query: string
  sessionId?: string
}

// This represents the structure of the data field within an SSE MessageEvent
// from the /api/chat endpoint.
export type ChatServiceEventData =
  | { type: 'embedding_result'; success: boolean; error?: string }
  | { type: 'retrieved_context'; context: any[]; query?: string }
  | { type: 'llm_chunk'; content: string }
  | {
      type: 'llm_sources'
      sources: { id: string; title: string; url: string; pageNumber?: number }[]
    }
  | {
      type: 'llm_response' // For non-streaming full response when no context is found
      content: string
      sources: { id: string; title: string; url: string; pageNumber?: number }[]
    }
  | { type: 'error'; message: string; details?: any }

// Define types for the final structured response of a chat interaction
export interface ChatCitation {
  id: string
  title: string
  source_url: string // Mapped from 'url' from backend
  source_name?: string // Optional, can be derived from title or URL
  pageNumber?: number
}

export interface ChatResponse {
  success: boolean
  content?: string // Aggregated final content, though streaming updates UI primarily
  citations?: ChatCitation[]
  error?: string
  sessionId?: string // If needed for session management continuity
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api'

/**
 * Calls the backend to ingest a document from a given URL.
 * @param url The URL of the document to ingest.
 * @returns A promise that resolves to an IngestResponse object.
 */
export async function ingestDocument(url: string): Promise<IngestResponse> {
  const requestBody: IngestRequestBody = { url }
  try {
    const response = await fetch(`${API_BASE_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    // Try to parse JSON regardless of response.ok, as errors might also be JSON
    const responseData = await response.json().catch(() => null)

    if (!response.ok) {
      const errorMessage =
        responseData?.message ||
        responseData?.error ||
        `HTTP error! status: ${response.status}`
      throw new Error(errorMessage)
    }
    // Assuming successful response includes jobId and message as per backend
    return responseData as IngestResponse
  } catch (error) {
    console.error('Error during document ingestion:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown ingestion error'
    // Standardize error response for the caller
    return { message: errorMessage, error: errorMessage }
  }
}

/**
 * INTERNAL: Initiates a chat request to the backend and returns a ReadableStream for Server-Sent Events.
 * The consumer of this stream will need to parse the SSE messages according to the MessageEvent spec.
 * Each SSE 'data' field will be a JSON string parsable into ChatServiceEventData.
 *
 * @param query The user's chat query.
 * @param sessionId Optional session ID for maintaining chat context.
 * @returns A promise that resolves to a ReadableStream<Uint8Array> or null if an error occurs before establishing the stream.
 */
async function internal_streamChat(
  query: string,
  sessionId?: string
): Promise<ReadableStream<Uint8Array> | null> {
  const requestBody: ChatRequestBody = { query, sessionId }
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream', // Crucial for SSE
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      // Attempt to parse error response from backend, fallback to status text
      const errorData = await response
        .json()
        .catch(() => ({ message: response.statusText }))
      throw new Error(
        errorData.message || `HTTP error! status: ${response.status}`
      )
    }

    if (!response.body) {
      throw new Error('Response body is null, cannot establish SSE stream.')
    }
    return response.body
  } catch (error) {
    console.error('Error initiating chat stream:', error)
    return null // Indicate failure to establish the stream
  }
}

/**
 * Handles a chat interaction with the backend, processing Server-Sent Events (SSE).
 * Provides real-time text chunks via a callback and returns a final response
 * with aggregated citations or errors.
 *
 * @param query The user's chat query.
 * @param onChunk A callback function that receives text chunks as they arrive.
 *                The chunk object will have a 'content' property (string).
 * @param sessionId Optional session ID for maintaining chat context.
 * @returns A Promise that resolves to a ChatResponse object.
 */
export async function chatWithBot(
  query: string,
  onChunk: (chunk: { content: string }) => void,
  sessionId?: string
): Promise<ChatResponse> {
  const stream = await internal_streamChat(query, sessionId)
  if (!stream) {
    return { success: false, error: 'Failed to connect to chat service.' }
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let accumulatedContent = ''
  const SSECitations: ChatCitation[] = []
  let sseBuffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break // Stream finished
      }

      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i]
        if (line.startsWith('data: ')) {
          const jsonData = line.substring(5).trim()
          if (jsonData) {
            try {
              const eventData = JSON.parse(jsonData) as ChatServiceEventData
              if (eventData.type === 'llm_chunk' && eventData.content) {
                onChunk({ content: eventData.content })
                accumulatedContent += eventData.content
              } else if (
                eventData.type === 'llm_sources' &&
                eventData.sources
              ) {
                eventData.sources.forEach((src) => {
                  SSECitations.push({
                    id: src.id,
                    title: src.title,
                    source_url: src.url,
                    source_name: src.title || src.url, // Basic name generation
                    pageNumber: src.pageNumber,
                  })
                })
              } else if (
                eventData.type === 'llm_response' &&
                eventData.content
              ) {
                // This case is for non-streaming full responses, e.g., when no context found
                // If streaming is also happening, this might be a final full message.
                // For pure streaming, llm_chunk is primary. Let's assume onChunk handles display.
                accumulatedContent = eventData.content // Overwrite or append based on desired logic
                if (eventData.sources) {
                  eventData.sources.forEach((src) => {
                    SSECitations.push({
                      id: src.id,
                      title: src.title,
                      source_url: src.url,
                      source_name: src.title || src.url,
                      pageNumber: src.pageNumber,
                    })
                  })
                }
              } else if (eventData.type === 'error') {
                console.error(
                  'SSE Error Event:',
                  eventData.message,
                  eventData.details
                )
                return {
                  success: false,
                  error: eventData.message || 'An error occurred during chat.',
                }
              }
            } catch (parseError) {
              console.error(
                'Failed to parse SSE data chunk:',
                jsonData,
                parseError
              )
              // Potentially ignore malformed messages or handle error
            }
          }
        }
      }
      sseBuffer = lines[lines.length - 1] // Keep the last partial line
    }
    // Final processing of any remaining buffer content (though less likely for SSE well-formed streams)
    if (sseBuffer.startsWith('data: ')) {
      // ... handle similar to loop ... (simplified here)
    }

    return {
      success: true,
      content: accumulatedContent,
      citations: SSECitations,
    }
  } catch (error) {
    console.error('Error reading chat stream:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown stream error.',
    }
  } finally {
    reader.releaseLock()
  }
}
