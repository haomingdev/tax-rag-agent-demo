import { Module, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config'; // ConfigService is still needed for type, ConfigModule can be removed if global
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service'; 
import { WeaviateModule } from '../weaviate/weaviate.module'; // Added import
import { IngestionProcessor } from './ingestion.processor'; // For queue worker

export const INGESTION_QUEUE_NAME = 'ingestion';

@Module({
  imports: [
    WeaviateModule, // Added WeaviateModule
    // ConfigModule, // Removed as ConfigModule is global in AppModule
    BullModule.forRootAsync({
      imports: [ConfigModule], // Still need ConfigModule here for useFactory's DI context if not implicitly available
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          // password: configService.get<string>('REDIS_PASSWORD'), // Add if your Redis has a password
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueueAsync({
      name: INGESTION_QUEUE_NAME,
      // imports: [ConfigModule], // Optional if default job options depend on config
      // useFactory: async (configService: ConfigService) => ({ // Optional for default job options
      //   defaultJobOptions: {
      //     attempts: configService.get<number>('INGESTION_JOB_ATTEMPTS', 3),
      //     backoff: {
      //       type: 'exponential',
      //       delay: configService.get<number>('INGESTION_JOB_BACKOFF_DELAY', 1000),
      //     },
      //   },
      // }),
      // inject: [ConfigService],
    }),
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService, 
    IngestionProcessor, 
    Logger,
  ],
  exports: [IngestionService], 
})
export class IngestionModule {}
