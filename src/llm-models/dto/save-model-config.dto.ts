import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class SaveModelConfigDto {
  @IsString()
  providerId: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsBoolean()
  isEnabled: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
