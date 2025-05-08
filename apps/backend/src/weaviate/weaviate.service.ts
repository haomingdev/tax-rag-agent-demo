import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import weaviate, { WeaviateClient, ApiKey, WeaviateClass, ConnectionParams } from 'weaviate-ts-client';

@Injectable()
export class WeaviateService implements OnModuleInit {
  private client: WeaviateClient;
  private readonly clientConfig: Partial<ConnectionParams> = {};

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    const weaviateHost = this.configService.get<string>('WEAVIATE_HOST');
    const weaviatePort = this.configService.get<string>('WEAVIATE_PORT');
    const weaviateScheme = this.configService.get<string>('WEAVIATE_SCHEME');

    if (!weaviateHost || !weaviatePort || !weaviateScheme) {
      this.logger.error('Weaviate connection details not found in environment variables.');
      throw new Error('Weaviate connection details missing.');
    }

    this.clientConfig.scheme = weaviateScheme as 'http' | 'https';
    this.clientConfig.host = `${weaviateHost}:${weaviatePort}`;

    console.log('[WeaviateService constructor] About to get WEAVIATE_API_KEY');
    const weaviateApiKey = this.configService.get<string>('WEAVIATE_API_KEY');

    if (weaviateApiKey) {
      this.clientConfig.apiKey = new weaviate.ApiKey(weaviateApiKey);
    }

    this.client = weaviate.client(this.clientConfig as ConnectionParams);
  }

  async onModuleInit() {
    this.logger.log('onModuleInit started. Checking Weaviate readiness...');
    try {
      const isReady = await this.client.misc.readyChecker();
      this.logger.log(`Weaviate is ready: ${isReady}`);
      if (isReady) {
        await this.initializeSchema();
      } else {
        this.logger.error(
          'Weaviate is not ready. Schema initialization skipped.',
        );
      }
    } catch (err) {
      this.logger.error(
        `[WeaviateService onModuleInit] Error during onModuleInit: ${err.message}`,
        err.stack,
      );
      throw new Error(
        `Failed to connect to Weaviate or ensure schema readiness: ${err.message}`,
      );
    }
  }

  private async classExists(className: string): Promise<boolean> {
    try {
      await this.client.schema.classGetter().withClassName(className).do();
      return true;
    } catch (err) {
      return false;
    }
  }

  private async initializeSchema() {
    const classes: WeaviateClass[] = [
      {
        class: 'IngestJob',
        description: 'Tracks the ingestion process of documents.',
        properties: [
          { name: 'jobId', dataType: ['uuid'], description: 'Unique job id' },
          { name: 'url', dataType: ['text'], description: 'Submitted URL' },
          { name: 'status', dataType: ['text'], description: 'Enum: pending|processing|completed|failed' },
          { name: 'queuedAt', dataType: ['date'], description: 'Time queued' },
          { name: 'completedAt', dataType: ['date'], description: 'Nullable finish time' },
          { name: 'errorMessage', dataType: ['text'], description: 'Nullable error message' },
        ],
        vectorizer: 'none',
      },
      {
        class: 'RawDoc',
        description: 'Represents a raw document before chunking.',
        properties: [
          { name: 'docId', dataType: ['uuid'], description: 'Document id' },
          { name: 'jobId', dataType: ['IngestJob'], description: 'Link to job' },
          { name: 'sourceUrl', dataType: ['text'], description: 'Original URL' },
          { name: 'title', dataType: ['text'], description: 'Parsed title' },
          { name: 'createdAt', dataType: ['date'], description: 'Timestamp' },
        ],
        vectorizer: 'none',
      },
      {
        class: 'DocChunk',
        description: 'Represents a chunk of a document with its embedding.',
        properties: [
          { name: 'chunkId', dataType: ['uuid'], description: 'Chunk id' },
          { name: 'docId', dataType: ['RawDoc'], description: 'Parent doc' },
          { name: 'chunkIndex', dataType: ['int'], description: 'Order within the document' },
          { name: 'text', dataType: ['text'], description: 'Chunk content' },
          { name: 'embedding', dataType: ['number[]'], description: 'Supplied vector' },
          { name: 'createdAt', dataType: ['date'], description: 'Timestamp' },
        ],
        vectorizer: 'none',
        vectorIndexConfig: {
          distance: 'cosine',
        },
        moduleConfig: {
          // This is where you would specify the vectorizer if Weaviate were to generate embeddings
          // e.g. 'text2vec-transformers': { 'vectorizeClassName': false }
          // For externally supplied vectors, 'none' is primary, but some modules might interact here.
          // For `vectorizer: 'none'`, this section might not be strictly necessary or used differently
          // based on specific Weaviate version nuances for pre-vectorized data.
        },
      },
      {
        class: 'ChatInteraction',
        description: 'Logs a single chat interaction.',
        properties: [
          { name: 'chatId', dataType: ['uuid'], description: 'Chat id' },
          { name: 'userSessionId', dataType: ['text'], description: 'Frontend session token' },
          { name: 'prompt', dataType: ['text'], description: 'User prompt' },
          { name: 'answer', dataType: ['text'], description: 'Assistant answer' },
          { name: 'citations', dataType: ['DocChunk[]'], description: 'Chunks cited' },
          { name: 'askedAt', dataType: ['date'], description: 'Timestamp' },
        ],
        vectorizer: 'none',
      },
    ];

    for (const classObj of classes) {
      if (!(await this.classExists(classObj.class))) {
        try {
          await this.client.schema.classCreator().withClass(classObj).do();
          this.logger.log(`Class '${classObj.class}' created successfully.`);
        } catch (err) {
          this.logger.error(`Failed to create class '${classObj.class}':`, err);
        }
      } else {
        this.logger.log(`Class '${classObj.class}' already exists.`);
        // Optionally, add logic here to update the class if schema has changed,
        // but this can be complex and destructive.
      }
    }
  }

  async createObject(
    className: string,
    properties: Record<string, any>,
    idToSet?: string, // Optional ID to set for the object
    vector?: number[],
  ): Promise<string> {
    let creator = this.client.data
      .creator()
      .withClassName(className)
      .withProperties(properties);

    if (idToSet) {
      creator = creator.withId(idToSet);
    }
    if (vector) {
      creator = creator.withVector(vector);
    }

    try {
      const result = await creator.do();
      this.logger.log(`Object created in class '${className}' with ID: ${result.id}`);
      return result.id; // Weaviate returns the full object, we just need the ID here or it's in result.id
    } catch (err) {
      this.logger.error(
        `Failed to create object in class '${className}': ${err.message}`,
        err.stack,
      );
      throw err; // Re-throw the error to be handled by the caller
    }
  }

  async getObjectById(className: string, id: string): Promise<any | null> {
    try {
      const result = await this.client.data
        .getterById()
        .withClassName(className)
        .withId(id)
        .do();
      return result; // This is the full object
    } catch (err) {
      // Weaviate client throws an error if object not found, e.g. with status 404
      // It might be better to check err.statusCode or err.message to specifically identify "not found"
      this.logger.warn(`Object with ID '${id}' not found in class '${className}': ${err.message}`);
      return null;
    }
  }

  async updateObject(
    className: string,
    id: string,
    propertiesToMerge: Record<string, any>,
  ): Promise<void> {
    try {
      await this.client.data
        .merger()
        .withClassName(className)
        .withId(id)
        .withProperties(propertiesToMerge)
        .do();
      this.logger.log(
        `Object with ID '${id}' in class '${className}' updated successfully.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to update object with ID '${id}' in class '${className}': ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  async addObjectsBatch(
    objects: { 
      className: string; 
      properties: Record<string, any>; 
      id?: string; 
      vector?: number[] 
    }[],
  ): Promise<any> { // The return type from Weaviate batch can be complex, using 'any' for now
    let batcher = this.client.batch.objectsBatcher();
    for (const obj of objects) {
      batcher = batcher.withObject({
        class: obj.className,
        properties: obj.properties,
        id: obj.id, // Weaviate's ts-client handles undefined id by auto-generating UUID
        vector: obj.vector,
      });
    }

    try {
      const results = await batcher.do();
      this.logger.log(`Batch of ${objects.length} objects added successfully.`);
      // Results contain status for each object, useful for detailed error handling
      return results;
    } catch (err) {
      this.logger.error(
        `Failed to add batch of ${objects.length} objects: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  getClient(): WeaviateClient {
    if (!this.client) {
      this.logger.error('Attempted to get Weaviate client before it was initialized.');
      throw new Error('Weaviate client not initialized. Ensure onModuleInit has completed successfully.');
    }
    return this.client;
  }
}
