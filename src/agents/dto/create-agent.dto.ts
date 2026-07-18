import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsNotEmpty()
  schema: Record<string, any>;

  @IsString()
  @IsOptional()
  version?: string;
}
