import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAppearanceDto {
  @IsString()
  @IsOptional()
  @IsIn(['Light', 'Dark', 'System'])
  theme?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Expanded', 'Collapsed'])
  sidebarDefault?: string;
}
