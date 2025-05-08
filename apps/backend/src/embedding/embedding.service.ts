import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private embeddings: GoogleGenerativeAIEmbeddings;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured.');
      throw new Error('GEMINI_API_KEY is not configured. Cannot initialize EmbeddingService.');
    }
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: 'models/text-embedding-004', // or 'embedding-001'
    });
  }

  async embedDocuments(texts: string[]): Promise<number[][] | null> {
    if (!texts || texts.length === 0) {
      this.logger.log('No texts provided to embed.');
      return [];
    }
    try {
      this.logger.log(`Generating embeddings for ${texts.length} text chunk(s).`);
      const documentEmbeddings = await this.embeddings.embedDocuments(texts);
      if (documentEmbeddings && documentEmbeddings.length > 0 && documentEmbeddings[0]) {
        this.logger.log(`First embedding dimension: ${documentEmbeddings[0].length}`);
      }
      return documentEmbeddings;
    } catch (error) {
      this.logger.error(`Error generating embeddings: ${error.message}`, error.stack);
      return null;
    }
  }

  async embedQuery(text: string): Promise<number[] | null> {
    if (!text) {
      this.logger.log('No query text provided to embed.');
      return null;
    }
    try {
      this.logger.log('Generating embedding for query.');
      const queryEmbedding = await this.embeddings.embedQuery(text);
      this.logger.log(`Query embedding dimension: ${queryEmbedding?.length}`);
      return queryEmbedding;
    } catch (error) {
      this.logger.error(`Error generating query embedding: ${error.message}`, error.stack);
      return null;
    }
  }
}
