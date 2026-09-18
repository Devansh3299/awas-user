import { IsString, IsOptional } from 'class-validator';

export class TestLlmConnectionDto {
  @IsString()
  providerId: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  modelId?: string;
}
