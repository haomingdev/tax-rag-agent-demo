import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { MessageEvent } from '@nestjs/common';
import { WeaviateService } from '../weaviate/weaviate.service';
import { WeaviateObject } from 'weaviate-ts-client';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { v4 as uuidv4 } from 'uuid';

interface DocChunkContext {
  id: string; 
  properties: {
    content: string;
    sourceUrl?: string;
    sourceTitle?: string;
    pageNumber?: number;
  };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private embeddings: GoogleGenerativeAIEmbeddings;
  private llm: ChatGoogleGenerativeAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly weaviateService: WeaviateService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured.');
      throw new Error('GEMINI_API_KEY is not configured.');
    }
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: 'models/text-embedding-004',
    });
    this.logger.log('GoogleGenerativeAIEmbeddings initialized with model models/text-embedding-004');

    this.llm = new ChatGoogleGenerativeAI({
      apiKey,
      model: 'gemini-1.5-pro-latest', 
      temperature: 0.3, 
    });
    this.logger.log('ChatGoogleGenerativeAI initialized with model gemini-1.5-pro-latest');
  }

  async embedQuery(query: string): Promise<number[]> {
    try {
      this.logger.log(`Embedding query: "${query.substring(0, 50)}..."`);
      const result = await this.embeddings.embedQuery(query);
      this.logger.log(`Successfully embedded query. Embedding dimension: ${result.length}`);
      return result;
    } catch (error) {
      this.logger.error(`Error embedding query: ${error.message}`, error.stack);
      throw error;
    }
  }

  sendMessageAndStreamResponse(query: string, sessionId?: string): Observable<MessageEvent> {
    this.logger.log(`sendMessageAndStreamResponse called with query: "${query}", sessionId: ${sessionId}`);
    
    return new Observable<MessageEvent>(subscriber => {
      this.embedQuery(query)
        .then(async embedding => {
          subscriber.next({ data: { type: 'embedding_result', dimension: embedding.length } });
          this.logger.log(`Query embedded. Dimension: ${embedding.length}. Now performing similarity search.`);

          try {
            const client = this.weaviateService.getClient();
            const searchResult = await client.graphql
              .get()
              .withClassName('DocChunk')
              .withFields('content sourceUrl sourceTitle pageNumber _additional { id }')
              .withNearVector({ vector: embedding })
              .withLimit(3)
              .do();

            const searchResults = searchResult?.data?.Get?.DocChunk || [];
            this.logger.log(`Retrieved ${searchResults.length} DocChunk(s) from Weaviate.`);
            
            const retrievedContext: DocChunkContext[] = searchResults.map(obj => ({
              id: obj._additional.id,
              properties: {
                content: obj.content,
                sourceUrl: obj.sourceUrl,
                sourceTitle: obj.sourceTitle,
                pageNumber: obj.pageNumber,
              },
            }));

            subscriber.next({ data: { type: 'retrieved_context', context: retrievedContext } });

            if (retrievedContext.length === 0) {
              this.logger.warn('No context retrieved from Weaviate. Replying that answer is not found.');
              subscriber.next({ data: { type: 'llm_response', content: "I couldn't find any relevant information to answer your question.", sources: [] } });
              subscriber.complete();
              return;
            }

            const formattedContext = retrievedContext
              .map((doc, index) => `Source ${index + 1} (ID: ${doc.id}):\n${doc.properties.content}`)
              .join('\n\n---\n\n');

            const promptTemplate = ChatPromptTemplate.fromMessages([
              ['system', 
                'You are a helpful assistant. Answer the user\'s question based ONLY on the following context. '
                + 'Include citations to the sources used in your answer, for example: "This is stated in Source 1 (ID: xxx)". '
                + 'If the context doesn\'t contain the answer, state that you cannot answer the question based on the provided information. '
                + 'Do not use any information outside of the provided context.'
              ],
              ['human', 'Context:\n{context}\n\n---\n\nQuestion: {question}'],
            ]);

            const ragChain = promptTemplate.pipe(this.llm).pipe(new StringOutputParser());

            this.logger.log('Streaming RAG chain response...');
            const stream = await ragChain.stream({
              context: formattedContext,
              question: query,
            });

            let fullResponse = '';
            for await (const chunk of stream) {
              fullResponse += chunk;
              subscriber.next({ data: { type: 'llm_chunk', content: chunk } });
            }
            this.logger.log(`RAG chain streaming complete. Full response length: ${fullResponse.length}`);

            // Store ChatInteraction
            const chatId = uuidv4();
            const askedAt = new Date().toISOString();
            const interactionCitations = retrievedContext.map(doc => (
              `weaviate://localhost/DocChunk/${doc.id}`
            ));

            const chatInteractionData = {
              chatId,
              userSessionId: sessionId || null, // Handle undefined sessionId
              prompt: query,
              answer: fullResponse,
              citations: interactionCitations,
              askedAt,
            };

            try {
              await client.data
                .creator()
                .withClassName('ChatInteraction')
                .withProperties(chatInteractionData)
                .withId(chatId) // Use the generated chatId as the Weaviate object ID
                .do();
              this.logger.log(`Successfully stored ChatInteraction with ID: ${chatId}`);
            } catch (storeError) {
              this.logger.error(`Failed to store ChatInteraction (ID: ${chatId}): ${storeError.message}`, storeError.stack);
              // Decide if this error should be fatal to the stream or just logged.
              // For now, we'll log it and continue sending sources to the client.
              // In a production system, you might want to handle this more robustly.
            }

            subscriber.next({
              data: {
                type: 'llm_sources',
                sources: retrievedContext.map(doc => ({
                  id: doc.id,
                  title: doc.properties.sourceTitle,
                  url: doc.properties.sourceUrl,
                  pageNumber: doc.properties.pageNumber,
                })),
              },
            });
            subscriber.complete();

          } catch (processError) {
            this.logger.error(`Error during Weaviate search or LLM processing: ${processError.message}`, processError.stack);
            subscriber.error({ data: { type: 'error', message: 'Failed to process chat request.', details: processError.message } });
          }
        })
        .catch(embeddingError => {
          this.logger.error(`Error embedding query in sendMessageAndStreamResponse: ${embeddingError.message}`, embeddingError.stack);
          subscriber.error({ data: { type: 'error', message: 'Failed to process chat request due to embedding failure.', details: embeddingError.message } });
        });
    });
  }
}
