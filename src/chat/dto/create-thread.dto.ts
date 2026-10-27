import { IsString, IsOptional } from 'class-validator';

export class CreateThreadDto {
  @IsString()
  @IsOptional()
  threadId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  type?: string; // 'studio' | 'agent' | 'workflow'

  @IsString()
  @IsOptional()
  agentId?: string;

  @IsString()
  @IsOptional()
  workflowId?: string;

  @IsOptional()
  metadata?: any;
}
