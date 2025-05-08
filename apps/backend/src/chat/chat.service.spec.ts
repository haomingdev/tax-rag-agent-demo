import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { WeaviateService } from '../weaviate/weaviate.service';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { of, throwError } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

// Mock the GoogleGenerativeAIEmbeddings and ChatGoogleGenerativeAI classes
const mockEmbedQuery = jest.fn();
const mockLLMInvoke = jest.fn();
const mockLLMStream = jest.fn(); // For future use

jest.mock('@langchain/google-genai', () => ({
  GoogleGenerativeAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: mockEmbedQuery,
  })),
  ChatGoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    invoke: mockLLMInvoke, // Keep for non-streaming if ever needed by other methods
    stream: mockLLMStream,
  })),
}));

// Mock LangChain core components
const mockPromptTemplatePipe = jest.fn();

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockImplementation(() => ({
      pipe: mockPromptTemplatePipe, // Directly use mockPromptTemplatePipe here
    })),
  },
}));

// mockPromptTemplate is still needed for resetting the mock in beforeEach
const mockPromptTemplate = {
  pipe: mockPromptTemplatePipe,
};

const mockStringOutputParser = jest.fn();
jest.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: jest.fn().mockImplementation(() => mockStringOutputParser),
}));

// --- Existing WeaviateService Mocks ---
const mockGraphQLGetChainer = {
  withClassName: jest.fn().mockReturnThis(),
  withFields: jest.fn().mockReturnThis(),
  withNearVector: jest.fn().mockReturnThis(),
  withLimit: jest.fn().mockReturnThis(),
  do: jest.fn(),
};

const mockWeaviateDataCreator = {
  withClassName: jest.fn().mockReturnThis(),
  withProperties: jest.fn().mockReturnThis(),
  withId: jest.fn().mockReturnThis(),
  do: jest.fn().mockResolvedValue(undefined), // Mock a successful creation
};

const mockWeaviateClient = {
  graphql: {
    get: jest.fn(() => mockGraphQLGetChainer),
  },
  data: {
    creator: jest.fn(() => mockWeaviateDataCreator),
  }
};

// --- End WeaviateService Mocks ---

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

const mockWeaviateService = {
  getClient: jest.fn().mockReturnValue(mockWeaviateClient),
};

const mockApiKey = 'test-api-key';

describe('ChatService', () => {
  let service: ChatService;
  let configService: ConfigService;
  // let weaviateService: WeaviateService; // Not strictly needed due to direct mock usage

  const mockEmbedding = [0.1, 0.2, 0.3];

  beforeEach(async () => {
    // Reset mocks for chained calls before each test to ensure clean state
    mockGraphQLGetChainer.withClassName.mockClear().mockReturnThis();
    mockGraphQLGetChainer.withFields.mockClear().mockReturnThis();
    mockGraphQLGetChainer.withNearVector.mockClear().mockReturnThis();
    mockGraphQLGetChainer.withLimit.mockClear().mockReturnThis();
    mockGraphQLGetChainer.do.mockClear();

    mockWeaviateDataCreator.withClassName.mockClear();
    mockWeaviateDataCreator.withProperties.mockClear();
    mockWeaviateDataCreator.withId.mockClear();
    mockWeaviateDataCreator.do.mockClear();

    // Reset LangChain mocks
    mockEmbedQuery.mockClear();
    mockLLMInvoke.mockClear();
    (GoogleGenerativeAIEmbeddings as jest.Mock).mockClear();
    (ChatGoogleGenerativeAI as unknown as jest.Mock).mockClear();
    (ChatPromptTemplate.fromMessages as jest.Mock).mockClear().mockImplementation(() => ({
      pipe: mockPromptTemplatePipe,
    }));
    mockPromptTemplatePipe.mockClear().mockImplementation(function(this: any, arg: any) { // Use function for `this`
      if (arg instanceof ChatGoogleGenerativeAI || arg === mockLLMInvoke || arg === mockLLMStream) { // if piping to LLM mock
        return { pipe: mockPromptTemplatePipe }; // return a new object that also has a pipe method
      } else if (arg === mockStringOutputParser) { // if piping to OutputParser
        // This is the end of the chain definition, return the object that has 'stream'
        return { stream: mockLLMStream, invoke: mockLLMInvoke }; // Support both stream and invoke for flexibility in tests
      }
      return this; // Default to allow chaining
    });
    (StringOutputParser as unknown as jest.Mock).mockClear().mockReturnValue(mockStringOutputParser);

    mockWeaviateClient.graphql.get.mockClear();
    mockWeaviateClient.data.creator.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GEMINI_API_KEY') {
                return mockApiKey;
              }
              return null;
            }),
          },
        },
        {
          provide: WeaviateService,
          useValue: mockWeaviateService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    configService = module.get<ConfigService>(ConfigService);
    // weaviateService = module.get<WeaviateService>(WeaviateService); // We use the mock directly

    (configService.get as jest.Mock).mockClear(); // Clear after service init uses it
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize Embeddings and LLM on construction', () => {
    // Service is already initialized in beforeEach
    expect(GoogleGenerativeAIEmbeddings).toHaveBeenCalledTimes(1);
    expect(GoogleGenerativeAIEmbeddings).toHaveBeenCalledWith({
      apiKey: mockApiKey,
      model: 'models/text-embedding-004',
    });
    expect(ChatGoogleGenerativeAI).toHaveBeenCalledTimes(1);
    expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({
      apiKey: mockApiKey,
      model: 'gemini-1.5-pro-latest',
      temperature: 0.3,
    });
  });

  describe('embedQuery', () => {
    const query = 'Hello, world!';
    it('should call embeddings.embedQuery and return the result', async () => {
      mockEmbedQuery.mockResolvedValue(mockEmbedding);
      const result = await service.embedQuery(query);
      expect(result).toEqual(mockEmbedding);
      expect(mockEmbedQuery).toHaveBeenCalledWith(query);
    });

    it('should throw an error if embeddings.embedQuery fails', async () => {
      const errorMessage = 'Embedding failed';
      mockEmbedQuery.mockRejectedValue(new Error(errorMessage));
      await expect(service.embedQuery(query)).rejects.toThrow(errorMessage);
    });
  });

  describe('sendMessageAndStreamResponse', () => {
    const testQuery = 'What is the meaning of life?';
    const testSessionId = 'session-123';
    const mockWeaviateDocs = [
      { _additional: { id: 'doc1' }, content: 'Life is a journey.', sourceTitle: 'Journey of Life', sourceUrl: 'http://example.com/life', pageNumber: 1 },
      { _additional: { id: 'doc2' }, content: 'The number 42.', sourceTitle: 'Hitchhiker\'s Guide', sourceUrl: 'http://example.com/42', pageNumber: 42 },
    ];
    const mockLlmStreamChunks = ['Life is a ', 'journey, ', 'possibly 42.'];
    const mockLlmFullResponse = mockLlmStreamChunks.join('');

    beforeEach(() => {
      // Reset all relevant mocks before each test in this describe block
      mockEmbedQuery.mockReset();
      mockGraphQLGetChainer.do.mockReset();
      mockLLMStream.mockReset();
      mockLLMInvoke.mockReset();
      mockPromptTemplatePipe.mockClear(); 
      (ChatPromptTemplate.fromMessages as jest.Mock).mockClear().mockImplementation(() => ({
        pipe: mockPromptTemplatePipe,
      }));
      (StringOutputParser as unknown as jest.Mock).mockClear().mockReturnValue(mockStringOutputParser);

      // Clear calls on the actual chainable mock objects
      mockGraphQLGetChainer.withClassName.mockClear();
      mockGraphQLGetChainer.withFields.mockClear();
      mockGraphQLGetChainer.withNearVector.mockClear();
      mockGraphQLGetChainer.withLimit.mockClear();
      mockGraphQLGetChainer.do.mockClear();

      mockWeaviateDataCreator.withClassName.mockClear();
      mockWeaviateDataCreator.withProperties.mockClear();
      mockWeaviateDataCreator.withId.mockClear();
      mockWeaviateDataCreator.do.mockClear();

      // Ensure the top-level mocks for get() and creator() are reset for call counts if needed
      mockWeaviateClient.graphql.get.mockClear();
      mockWeaviateClient.data.creator.mockClear();

      // Default success path mocks (can be overridden by specific tests)
      // These will be set here but individual tests can override after the reset if needed.
      mockEmbedQuery.mockResolvedValue(mockEmbedding);
      mockGraphQLGetChainer.do.mockResolvedValue({ data: { Get: { DocChunk: mockWeaviateDocs } } });
      
      mockLLMStream.mockImplementation(async function*() {
        for (const chunk of mockLlmStreamChunks) {
          yield chunk;
        }
      });
      mockLLMInvoke.mockResolvedValue(mockLlmFullResponse); 

      // Reset pipe mock for specific chaining logic in tests
      // The final part of the chain (after StringOutputParser) is what has the stream method
      mockPromptTemplatePipe.mockImplementation((arg) => {
        // Check if arg is an instance of ChatGoogleGenerativeAI constructor
        // or if it is one of our direct mock functions for the LLM
        if (arg && (arg.constructor?.name === 'ChatGoogleGenerativeAI' || arg === mockLLMInvoke || arg === mockLLMStream)) {
          return { pipe: mockPromptTemplatePipe }; 
        } else if (arg === mockStringOutputParser) { 
          return { stream: mockLLMStream, invoke: mockLLMInvoke }; 
        }
        return { pipe: mockPromptTemplatePipe }; 
      });
    });

    it('should process query, retrieve context, stream LLM chunks, and then sources', (done) => {
      // This test relies on the default success mocks set in the beforeEach above
      const mockGeneratedChatId = 'test-chat-uuid';
      (uuidv4 as jest.Mock).mockReturnValue(mockGeneratedChatId);

      const stream = service.sendMessageAndStreamResponse(testQuery, testSessionId);
      const events = [];
      const receivedChunks = [];

      stream.subscribe({
        next: (event) => {
          events.push(event);
          if((event.data as any).type === 'llm_chunk') {
            receivedChunks.push((event.data as any).content);
          }
        },
        complete: () => {
          expect(mockEmbedQuery).toHaveBeenCalledWith(testQuery);
          expect(mockWeaviateService.getClient).toHaveBeenCalledTimes(1);
          expect(mockGraphQLGetChainer.do).toHaveBeenCalledTimes(1);
          expect(ChatPromptTemplate.fromMessages).toHaveBeenCalledTimes(1);
          expect(mockPromptTemplatePipe).toHaveBeenCalledTimes(2); 
          expect(mockLLMStream).toHaveBeenCalledTimes(1); // Check if stream was called
          expect(mockLLMStream).toHaveBeenCalledWith({
            context: mockWeaviateDocs.map((doc, i) => `Source ${i+1} (ID: ${doc._additional.id}):\n${doc.content}`).join('\n\n---\n\n'),
            question: testQuery,
          });

          expect(events.length).toBe(2 + mockLlmStreamChunks.length + 1); // embed, context, N chunks, sources
          expect((events[0].data as any).type).toBe('embedding_result');
          expect((events[0].data as any).dimension).toBe(mockEmbedding.length);
          expect((events[1].data as any).type).toBe('retrieved_context');
          expect((events[1].data as any).context.length).toBe(mockWeaviateDocs.length);
          
          // Check llm_chunk events
          const chunkEvents = events.filter(e => (e.data as any).type === 'llm_chunk');
          expect(chunkEvents.length).toBe(mockLlmStreamChunks.length);
          expect(receivedChunks).toEqual(mockLlmStreamChunks);

          // Check llm_sources event (should be the last event before complete)
          const sourcesEvent = events[events.length -1]; // The one before complete, which is not in events array
          expect((sourcesEvent.data as any).type).toBe('llm_sources');
          expect((sourcesEvent.data as any).sources).toEqual(mockWeaviateDocs.map(d => ({ id: d._additional.id, title: d.sourceTitle, url: d.sourceUrl, pageNumber: d.pageNumber })));
          
          // Verify ChatInteraction was stored
          expect(mockWeaviateClient.data.creator).toHaveBeenCalledTimes(1);
          expect(mockWeaviateDataCreator.withClassName).toHaveBeenCalledWith('ChatInteraction');
          expect(mockWeaviateDataCreator.withId).toHaveBeenCalledWith(mockGeneratedChatId);
          expect(mockWeaviateDataCreator.withProperties).toHaveBeenCalledWith(expect.objectContaining({
            chatId: mockGeneratedChatId,
            userSessionId: testSessionId,
            prompt: testQuery,
            answer: mockLlmStreamChunks.join(''),
            citations: mockWeaviateDocs.map(doc => `weaviate://localhost/DocChunk/${doc._additional.id}`),
            askedAt: expect.any(String), // Check for ISO string format if needed more strictly
          }));
          expect(mockWeaviateDataCreator.do).toHaveBeenCalledTimes(1);

          done();
        },
        error: (err) => done(err),
      });
    });

    it('should handle no context retrieved and send appropriate llm_response (non-streaming)', (done) => {
      // Specific mock setup for this test, overriding defaults from beforeEach if necessary
      // Ensure mocks are in the desired state for *this specific test*
      mockEmbedQuery.mockResolvedValue(mockEmbedding); // Still need embedding to work
      mockGraphQLGetChainer.do.mockResolvedValue({ data: { Get: { DocChunk: [] } } }); // CRITICAL: No docs for this test
      // mockLLMStream should NOT be configured to yield or throw here, as it shouldn't be called.
      // mockLLMInvoke should also not be configured if not expected to be called.

      const stream = service.sendMessageAndStreamResponse(testQuery, testSessionId);
      const events = [];
      stream.subscribe({
        next: (event) => events.push(event),
        complete: () => {
          expect(mockEmbedQuery).toHaveBeenCalledWith(testQuery);
          expect(mockGraphQLGetChainer.do).toHaveBeenCalledTimes(1);
          expect(mockLLMStream).not.toHaveBeenCalled(); // LLM stream should not be called
          expect(mockLLMInvoke).not.toHaveBeenCalled(); // Nor invoke

          // embedding_result, retrieved_context (empty), llm_response (because no context)
          expect(events.length).toBe(3); 
          expect((events[1].data as any).type).toBe('retrieved_context');
          expect((events[1].data as any).context).toEqual([]);
          expect((events[2].data as any)).toEqual({
            type: 'llm_response', // This is the special non-streaming response for no context
            content: "I couldn't find any relevant information to answer your question.",
            sources: []
          });
          expect(mockWeaviateClient.data.creator).not.toHaveBeenCalled(); // ChatInteraction should not be stored

          done();
        },
        error: (err) => done(err),
      });
    });

    it('should handle errors from LLM streaming', (done) => {
      const llmStreamError = new Error('LLM stream failed');
      
      // Specific mock setup for this test
      mockEmbedQuery.mockResolvedValue(mockEmbedding); // Embedding needs to succeed to reach LLM
      mockGraphQLGetChainer.do.mockResolvedValue({ data: { Get: { DocChunk: mockWeaviateDocs } } }); // Context needs to be retrieved
      mockLLMStream.mockImplementation(async function*() { // CRITICAL: LLM stream throws error
        throw llmStreamError; 
      });

      service.sendMessageAndStreamResponse(testQuery, testSessionId).subscribe({
        next: (event) => {
          if (((event.data as any).type === 'llm_chunk' || (event.data as any).type === 'llm_sources')) {
            done.fail('Should not have emitted llm_chunk or llm_sources on LLM stream error');
          }
        },
        error: (errEvent) => {
          expect(mockLLMStream).toHaveBeenCalledTimes(1);
          expect((errEvent.data as any).type).toBe('error');
          expect((errEvent.data as any).message).toBe('Failed to process chat request.');
          expect((errEvent.data as any).details).toBe(llmStreamError.message);
          expect(mockWeaviateClient.data.creator).not.toHaveBeenCalled(); // ChatInteraction should not be stored on LLM error
          done();
        },
        complete: () => done.fail('Stream should have errored'),
      });
    });

    it('should handle errors from Weaviate search (now combined with LLM error path)', (done) => {
      const searchError = new Error('Weaviate search failed');
      // Specific mock setup
      mockEmbedQuery.mockResolvedValue(mockEmbedding);
      mockGraphQLGetChainer.do.mockRejectedValueOnce(searchError); // CRITICAL: Weaviate search fails

      service.sendMessageAndStreamResponse(testQuery, testSessionId).subscribe({
        next: (event) => {
           // embedding_result might still come through
          if (((event.data as any).type === 'retrieved_context' || (event.data as any).type === 'llm_response' || (event.data as any).type === 'llm_chunk' || (event.data as any).type === 'llm_sources')) {
             done.fail('Should not emit context or llm response on weaviate error');
          }
        },
        error: (errEvent) => {
          expect((errEvent.data as any).type).toBe('error');
          // The message is now generic for any processing error after embedding
          expect((errEvent.data as any).message).toBe('Failed to process chat request.');
          expect((errEvent.data as any).details).toBe(searchError.message);
          expect(mockWeaviateClient.data.creator).not.toHaveBeenCalled(); // ChatInteraction should not be stored on Weaviate error
          done();
        },
        complete: () => done.fail('Stream should have errored'),
      });
    });

    it('should handle errors from embedQuery in the observable stream', (done) => {
      const embeddingError = new Error('Embedding failed in stream');
      // Specific mock setup
      mockEmbedQuery.mockRejectedValueOnce(embeddingError); // CRITICAL: Embedding fails
      // No need to mock Weaviate or LLM if embedding fails first

      service.sendMessageAndStreamResponse(testQuery, testSessionId).subscribe({
        next: () => done.fail('Stream should have errored, not emitted next.'),
        error: (errEvent) => {
          expect((errEvent.data as any).type).toBe('error');
          expect((errEvent.data as any).message).toBe('Failed to process chat request due to embedding failure.');
          expect((errEvent.data as any).details).toBe(embeddingError.message);
          expect(mockWeaviateClient.data.creator).not.toHaveBeenCalled(); // ChatInteraction should not be stored on embedding error
          done();
        },
        complete: () => done.fail('Stream should have errored'),
      });
    });
  });

  it('should throw error if GEMINI_API_KEY is not configured', () => {
    // This test is outside the describe block with the new beforeEach, so its mocks are simpler
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'GEMINI_API_KEY') return undefined;
      return null;
    });
    expect(() => new ChatService(configService, mockWeaviateService as any)).toThrow('GEMINI_API_KEY is not configured.');
  });
});
