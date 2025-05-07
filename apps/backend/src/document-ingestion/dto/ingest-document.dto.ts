import { IsUrl, IsNotEmpty, IsString } from 'class-validator';

export class IngestDocumentDto {
  @IsUrl({}, { message: 'Please provide a valid URL.' })
  @IsNotEmpty({ message: 'URL should not be empty.' })
  @IsString()
  url: string;
}
