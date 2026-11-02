import { IsString, IsOptional } from 'class-validator';

export class CreateWorkflowRunDto {
  /** Frontend run ID (e.g. "run-1790000000000"). Generated server-side if omitted. */
  @IsString()
  @IsOptional()
  runId?: string;

  /** Optional alias if frontend sends `id` directly. */
  @IsString()
  @IsOptional()
  id?: string;

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

  @IsOptional()
  duration?: any;

  @IsOptional()
  agentCount?: any;

  @IsOptional()
  agentsUsed?: any;

  @IsOptional()
  inputs?: any;

  @IsOptional()
  inputTopic?: any;

  @IsOptional()
  outputResult?: any;

  @IsOptional()
  logs?: any;

  @IsOptional()
  timelineTree?: any;

  @IsOptional()
  metrics?: any;

  @IsOptional()
  error?: any;

  @IsOptional()
  timestamp?: any;

  @IsOptional()
  timeFormatted?: any;

  @IsOptional()
  syncStatus?: any;

  @IsOptional()
  isPartial?: any;

  @IsOptional()
  _id?: any;

  @IsOptional()
  userId?: any;

  @IsOptional()
  startedAt?: any;

  @IsOptional()
  createdAt?: any;

  @IsOptional()
  updatedAt?: any;
}
