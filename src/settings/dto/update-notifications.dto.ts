import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationsDto {
  @IsBoolean()
  @IsOptional()
  automationFailures?: boolean;

  @IsBoolean()
  @IsOptional()
  weeklyDigest?: boolean;

  @IsBoolean()
  @IsOptional()
  agentErrorAlerts?: boolean;

  @IsBoolean()
  @IsOptional()
  billingReminders?: boolean;

  @IsBoolean()
  @IsOptional()
  newFeatures?: boolean;

  @IsBoolean()
  @IsOptional()
  teamActivity?: boolean;

  @IsOptional()
  emailDigestFrequency?: string;

  @IsOptional()
  webhookUrl?: string;
}
