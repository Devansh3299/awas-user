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
}
