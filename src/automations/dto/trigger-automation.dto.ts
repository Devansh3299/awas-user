import { IsOptional, IsObject, IsString } from 'class-validator';

export class TriggerAutomationDto {
  @IsObject()
  @IsOptional()
  inputPayload?: any;

  @IsString()
  @IsOptional()
  triggerSource?: string; // 'manual' | 'schedule' | 'webhook'
}
