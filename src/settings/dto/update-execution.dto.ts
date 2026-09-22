import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateExecutionDto {
  @IsString()
  @IsOptional()
  @IsIn(['cloud', 'local'])
  defaultExecutionMode?: string;

  @IsString()
  @IsOptional()
  defaultModelId?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsNumber()
  @IsOptional()
  @Min(256)
  @Max(32768)
  maxTokens?: number;
}
