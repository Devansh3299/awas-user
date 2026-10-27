import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsOptional()
  messageId?: string;

  @IsString()
  @IsNotEmpty()
  role: string; // 'user' | 'assistant' | 'system'

  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  reasoning?: string;

  @IsOptional()
  toolCalls?: any;

  @IsOptional()
  usage?: any;

  @IsString()
  @IsOptional()
  feedback?: string;

  @IsOptional()
  metadata?: any;
}
