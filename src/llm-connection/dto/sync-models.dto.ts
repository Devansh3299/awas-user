import { IsString, IsOptional } from 'class-validator';

export class SyncModelsDto {
  @IsString()
  providerId: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}
