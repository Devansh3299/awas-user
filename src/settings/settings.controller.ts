import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateAppearanceDto } from './dto/update-appearance.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateApiTokenDto } from './dto/create-api-token.dto';
import { Toggle2FaDto } from './dto/toggle-2fa.dto';
import { UpdateExecutionDto } from './dto/update-execution.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /settings
   * Retrieve all settings (profile, org, execution, notifications, appearance, region, security)
   */
  @Get()
  getSettings(@Request() req: any) {
    return this.settingsService.getSettings(req.user.id);
  }

  /**
   * PATCH /settings/profile
   * Update personal profile information
   */
  @Patch('profile')
  updateProfile(@Body() dto: UpdateProfileDto, @Request() req: any) {
    return this.settingsService.updateProfile(req.user.id, dto);
  }

  /**
   * PATCH /settings/organization
   * Update or create organization settings
   */
  @Patch('organization')
  updateOrganization(@Body() dto: UpdateOrganizationDto, @Request() req: any) {
    return this.settingsService.updateOrganization(req.user.id, dto);
  }

  /**
   * PATCH /settings/execution
   * Update dual-mode execution preferences (Cloud vs Local, default model, temp, tokens)
   */
  @Patch('execution')
  updateExecution(@Body() dto: UpdateExecutionDto, @Request() req: any) {
    return this.settingsService.updateExecution(req.user.id, dto);
  }

  /**
   * PATCH /settings/notifications
   * Update notification preferences & webhook configuration
   */
  @Patch('notifications')
  updateNotifications(
    @Body() dto: UpdateNotificationsDto,
    @Request() req: any,
  ) {
    return this.settingsService.updateNotifications(req.user.id, dto);
  }

  /**
   * PATCH /settings/appearance
   * Update appearance theme, sidebar layout, and canvas grid style
   */
  @Patch('appearance')
  updateAppearance(@Body() dto: UpdateAppearanceDto, @Request() req: any) {
    return this.settingsService.updateAppearance(req.user.id, dto);
  }

  /**
   * PATCH /settings/region
   * Update timezone, language, date format, and currency
   */
  @Patch('region')
  updateRegion(@Body() dto: UpdateRegionDto, @Request() req: any) {
    return this.settingsService.updateRegion(req.user.id, dto);
  }

  /**
   * POST /settings/security/password
   * Change user password after verifying current password
   */
  @Post('security/password')
  changePassword(@Body() dto: ChangePasswordDto, @Request() req: any) {
    return this.settingsService.changePassword(req.user.id, dto);
  }

  /**
   * POST /settings/security/2fa/toggle
   * Toggle 2FA authentication state
   */
  @Post('security/2fa/toggle')
  toggle2FA(@Body() dto: Toggle2FaDto, @Request() req: any) {
    return this.settingsService.toggle2FA(req.user.id, dto);
  }

  /**
   * GET /settings/security/tokens
   * List all personal access tokens for the user
   */
  @Get('security/tokens')
  listApiTokens(@Request() req: any) {
    return this.settingsService.listApiTokens(req.user.id);
  }

  /**
   * POST /settings/security/tokens
   * Generate a new personal access token with scopes
   */
  @Post('security/tokens')
  createApiToken(@Body() dto: CreateApiTokenDto, @Request() req: any) {
    return this.settingsService.createApiToken(req.user.id, dto);
  }

  /**
   * DELETE /settings/security/tokens/:id
   * Revoke an existing personal access token
   */
  @Delete('security/tokens/:id')
  revokeApiToken(@Param('id') id: string, @Request() req: any) {
    return this.settingsService.revokeApiToken(req.user.id, id);
  }

  /**
   * POST /settings/export
   * Export all workspace data (settings, workflows, custom agents)
   */
  @Post('export')
  exportWorkspaceData(@Request() req: any) {
    return this.settingsService.exportWorkspaceData(req.user.id);
  }

  /**
   * POST /settings/reset
   * Reset user settings to platform factory defaults
   */
  @Post('reset')
  resetSettings(@Request() req: any) {
    return this.settingsService.resetSettings(req.user.id);
  }
}
