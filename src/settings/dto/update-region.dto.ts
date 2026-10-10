import { IsOptional, IsString } from 'class-validator';

export class UpdateRegionDto {
  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  dateFormat?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  timeFormat?: string;

  @IsString()
  @IsOptional()
  numberFormat?: string;

  @IsString()
  @IsOptional()
  firstDayOfWeek?: string;

  @IsOptional()
  telemetryEnabled?: boolean;

  @IsOptional()
  crashReportsEnabled?: boolean;
}
