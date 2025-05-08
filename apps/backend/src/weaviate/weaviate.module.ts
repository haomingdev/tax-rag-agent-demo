import { Module, Logger } from '@nestjs/common';
import { WeaviateService } from './weaviate.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [WeaviateService, Logger],
  exports: [WeaviateService] 
})
export class WeaviateModule {}
