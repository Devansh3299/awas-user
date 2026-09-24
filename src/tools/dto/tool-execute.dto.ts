import { IsObject, IsOptional } from 'class-validator';

export class ToolExecuteDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, any>;

  @IsOptional()
  @IsObject()
  inputData?: Record<string, any>;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;
}
