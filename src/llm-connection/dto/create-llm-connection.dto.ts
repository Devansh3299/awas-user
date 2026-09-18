import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateLlmConnectionDto {
  @IsString()
  providerId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  availableModels?: any;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
