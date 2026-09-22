import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateApiTokenDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsOptional()
  expiresInDays?: number;

  @IsOptional()
  scopes?: string[];
}
