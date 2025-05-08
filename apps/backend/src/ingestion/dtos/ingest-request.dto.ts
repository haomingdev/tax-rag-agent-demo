import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl } from 'class-validator';

export class IngestRequestDto {
  @ApiProperty({
    description: 'The URL of the content to be ingested.',
    example: 'https://www.irs.gov/pub/irs-pdf/p15.pdf',
  })
  @IsUrl({}, { message: 'Please provide a valid URL.' })
  @IsNotEmpty({ message: 'URL should not be empty.' })
  url: string;
}
