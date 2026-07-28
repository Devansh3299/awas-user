import { IsNotEmpty, IsString, IsOptional, IsObject, IsNumber, IsPositive } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  mastraId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsNotEmpty()
  schema: Record<string, any>;

  @IsString()
  @IsOptional()
  version?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  username?: string;
}
