import { IsString, IsOptional, IsObject } from 'class-validator';

export class SaveToolConnectionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsString()
  status?: string;
}

export class TestToolConnectionDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
