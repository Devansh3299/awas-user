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

  @IsString()
  @IsOptional()
  @IsIn(['dots', 'lines', 'cross'])
  canvasGridStyle?: string;

  @IsString()
  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  interfaceDensity?: string;

  @IsOptional()
  soundEffects?: boolean;
}
