import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';

export class CreateWorkflowRunDto {
  /** Frontend run ID (e.g. "run-1790000000000"). Generated server-side if omitted. */
  @IsString()
  @IsOptional()
  runId?: string;

  /** Frontend workflow ID (e.g. "wf-1789470620862"). Taken from URL param if omitted. */
  @IsString()
  @IsOptional()
  workflowId?: string;

  @IsString()
  @IsOptional()
  workflowName?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  duration?: string;

  @IsInt()
  @IsOptional()
  agentCount?: number;

  @IsOptional()
  agentsUsed?: any;

  @IsOptional()
  inputs?: any;

  @IsString()
  @IsOptional()
  inputTopic?: string;

  @IsString()
  @IsOptional()
  outputResult?: string;

  @IsOptional()
  logs?: any;

  @IsOptional()
  timelineTree?: any;

  @IsOptional()
  metrics?: any;

  @IsString()
  @IsOptional()
  error?: string;

  @IsDateString()
  @IsOptional()
  timestamp?: string;
}
