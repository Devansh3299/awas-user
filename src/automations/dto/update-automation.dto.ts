import { IsString, IsOptional, IsIn, IsObject } from 'class-validator';

export class UpdateAutomationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Active', 'Paused', 'Draft', 'Error'])
  status?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Schedule', 'Webhook', 'Email', 'Queue', 'Event'])
  trigger?: string;

  @IsString()
  @IsOptional()
  cron?: string;

  @IsString()
  @IsOptional()
  scheduleLabel?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  webhookUrl?: string;

  @IsString()
  @IsOptional()
  webhookSecret?: string;

  @IsString()
  @IsOptional()
  @IsIn(['workflow', 'agent', 'crewstudio'])
  targetType?: string;

  @IsString()
  @IsOptional()
  targetId?: string;

  @IsObject()
  @IsOptional()
  inputPayload?: any;

  @IsString()
  @IsOptional()
  @IsIn(['cloud', 'local'])
  executionMode?: string;
}
