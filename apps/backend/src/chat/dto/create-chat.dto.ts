import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateChatDto {
  @ApiProperty({
    description: 'The user\'s query or message.',
    example: 'What are the new tax regulations for 2024?',
    type: String,
    maxLength: 2000, // Max length for a query
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  query: string;

  @ApiPropertyOptional({
    description: 'Optional session ID for maintaining conversation context.',
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    type: String,
    format: 'uuid',
  })
  @IsOptional()
  @IsString()
  @IsUUID('4') // Validate as UUID version 4
  sessionId?: string;
}
