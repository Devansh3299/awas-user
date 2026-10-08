import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class PublishMarketplaceItemDto {
  @IsString()
  @IsOptional()
  itemId?: string;

  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  price?: string;

  @IsString()
  @IsOptional()
  rating?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  userEmail?: string;

  @IsOptional()
  data?: any;

  @IsArray()
  @IsOptional()
  tags?: string[];
}
