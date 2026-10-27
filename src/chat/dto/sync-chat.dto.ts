import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class SyncThreadDto {
  @IsString()
  @IsNotEmpty()
  threadId: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  agentId?: string;

  @IsString()
  @IsOptional()
  workflowId?: string;

  @IsOptional()
  metadata?: any;

  @IsArray()
  @IsOptional()
  messages?: any[];
}
