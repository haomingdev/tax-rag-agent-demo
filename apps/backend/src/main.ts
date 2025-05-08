import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS if you plan to call from a different origin (e.g., frontend on localhost:3000 to backend on localhost:3001)
  app.enableCors(); 
  await app.listen(process.env.BACKEND_PORT ?? 3001);
  console.log(`Backend application is running on: ${await app.getUrl()}`);
}
bootstrap();
