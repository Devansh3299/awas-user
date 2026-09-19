import { IsBoolean, IsOptional } from 'class-validator';

export class Toggle2FaDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
