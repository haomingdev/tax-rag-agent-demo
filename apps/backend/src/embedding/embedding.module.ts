import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [ConfigModule], // Import ConfigModule to make ConfigService available
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
