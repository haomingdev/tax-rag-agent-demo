import { Module } from '@nestjs/common';
import { WeaviateService } from './weaviate.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [WeaviateService],
  exports: [WeaviateService] 
})
export class WeaviateModule {}
