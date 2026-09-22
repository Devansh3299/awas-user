import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateAppearanceDto } from './dto/update-appearance.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateApiTokenDto } from './dto/create-api-token.dto';
import { Toggle2FaDto } from './dto/toggle-2fa.dto';
import { UpdateExecutionDto } from './dto/update-execution.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Fetch complete settings bundle for the authenticated user.
   * Creates default UserSettings if not yet initialized in MongoDB.
   */
  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        settings: true,
        apiTokens: {
          select: {
            id: true,
            name: true,
            tokenPrefix: true,
            scopes: true,
            expiresAt: true,
            lastUsedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    let settings = user.settings;
    if (!settings) {
      settings = await this.prisma.userSettings.create({
        data: {
          userId,
          defaultExecutionMode: 'cloud',
          defaultModelId: 'google/gemini-2.5-flash',
          temperature: 0.7,
          maxTokens: 2048,
          automationFailures: true,
          weeklyDigest: true,
          agentErrorAlerts: true,
          billingReminders: false,
          newFeatures: false,
          teamActivity: true,
          emailDigestFrequency: 'weekly',
          webhookUrl: '',
          theme: 'Light',
          sidebarDefault: 'Expanded',
          canvasGridStyle: 'dots',
          interfaceDensity: 'comfortable',
          soundEffects: true,
          timezone: 'UTC+05:30 – Mumbai, New Delhi',
          language: 'English (US)',
          dateFormat: 'MM/DD/YYYY',
          currency: 'USD ($)',
          telemetryEnabled: true,
          crashReportsEnabled: true,
        },
      });
    }

    return {
      profile: {
        id: user.id,
        email: user.email,
        name: user.name || 'Alex Johnson',
        jobTitle: user.jobTitle || 'Product Engineer',
        bio: user.bio || 'Building agentic workflows at the edge.',
        avatarUrl: user.avatarUrl || '',
        role: user.role,
        createdAt: user.createdAt,
      },
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
            website: user.organization.website || '',
            industry: user.organization.industry || 'Software & Technology',
            logoUrl: user.organization.logoUrl || '',
          }
        : {
            id: '',
            name: 'Acme Corp',
            slug: 'acme-corp',
            website: 'https://acme.io',
            industry: 'Software & Technology',
            logoUrl: '',
          },
      execution: {
        defaultExecutionMode: settings.defaultExecutionMode || 'cloud',
        defaultModelId: settings.defaultModelId || 'google/gemini-2.5-flash',
        temperature: settings.temperature ?? 0.7,
        maxTokens: settings.maxTokens ?? 2048,
      },
      notifications: {
        automationFailures: settings.automationFailures,
        weeklyDigest: settings.weeklyDigest,
        agentErrorAlerts: settings.agentErrorAlerts,
        billingReminders: settings.billingReminders,
        newFeatures: settings.newFeatures,
        teamActivity: settings.teamActivity,
        emailDigestFrequency: settings.emailDigestFrequency || 'weekly',
        webhookUrl: settings.webhookUrl || '',
      },
      appearance: {
        theme: settings.theme,
        sidebarDefault: settings.sidebarDefault,
        canvasGridStyle: settings.canvasGridStyle || 'dots',
        interfaceDensity: settings.interfaceDensity || 'comfortable',
        soundEffects: settings.soundEffects ?? true,
      },
      region: {
        timezone: settings.timezone,
        language: settings.language,
        dateFormat: settings.dateFormat,
        currency: settings.currency || 'USD ($)',
      },
      privacy: {
        telemetryEnabled: settings.telemetryEnabled ?? true,
        crashReportsEnabled: settings.crashReportsEnabled ?? true,
      },
      security: {
        twoFactorEnabled: !!user.twoFactorEnabled,
        apiTokensCount: user.apiTokens?.length || 0,
      },
    };
  }

  /**
   * Update personal profile info in User collection.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      jobTitle: user.jobTitle,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }

  /**
   * Update or create organization settings in MongoDB Atlas.
   */
  async updateOrganization(userId: string, dto: UpdateOrganizationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const slug =
      dto.slug?.trim().toLowerCase() ||
      dto.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') ||
      'org-' + userId.slice(-6);

    let organization;
    if (user.organizationId) {
      organization = await this.prisma.organization.update({
        where: { id: user.organizationId },
        data: {
          name: dto.name,
          slug,
          website: dto.website,
          industry: dto.industry,
        },
      });
    } else {
      let finalSlug = slug;
      const existing = await this.prisma.organization.findUnique({
        where: { slug: finalSlug },
      });
      if (existing) {
        finalSlug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      }

      organization = await this.prisma.organization.create({
        data: {
          name: dto.name,
          slug: finalSlug,
          website: dto.website,
          industry: dto.industry,
          users: { connect: { id: userId } },
        },
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: { organizationId: organization.id },
      });
    }

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      website: organization.website || '',
      industry: organization.industry || '',
      logoUrl: organization.logoUrl || '',
    };
  }

  /**
   * Update execution defaults (Cloud vs Local mode, model, temperature, maxTokens).
   */
  async updateExecution(userId: string, dto: UpdateExecutionDto) {
    const data: any = {};
    if (dto.defaultExecutionMode !== undefined)
      data.defaultExecutionMode = dto.defaultExecutionMode;
    if (dto.defaultModelId !== undefined)
      data.defaultModelId = dto.defaultModelId;
    if (dto.temperature !== undefined) data.temperature = dto.temperature;
    if (dto.maxTokens !== undefined) data.maxTokens = dto.maxTokens;

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });

    return {
      defaultExecutionMode: settings.defaultExecutionMode,
      defaultModelId: settings.defaultModelId,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    };
  }

  /**
   * Update notification preferences in userSettings collection.
   */
  async updateNotifications(userId: string, dto: UpdateNotificationsDto) {
    const data: any = {};
    if (dto.automationFailures !== undefined)
      data.automationFailures = dto.automationFailures;
    if (dto.weeklyDigest !== undefined)
      data.weeklyDigest = dto.weeklyDigest;
    if (dto.agentErrorAlerts !== undefined)
      data.agentErrorAlerts = dto.agentErrorAlerts;
    if (dto.billingReminders !== undefined)
      data.billingReminders = dto.billingReminders;
    if (dto.newFeatures !== undefined) data.newFeatures = dto.newFeatures;
    if (dto.teamActivity !== undefined) data.teamActivity = dto.teamActivity;
    if (dto.emailDigestFrequency !== undefined)
      data.emailDigestFrequency = dto.emailDigestFrequency;
    if (dto.webhookUrl !== undefined) data.webhookUrl = dto.webhookUrl;

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });

    return {
      automationFailures: settings.automationFailures,
      weeklyDigest: settings.weeklyDigest,
      agentErrorAlerts: settings.agentErrorAlerts,
      billingReminders: settings.billingReminders,
      newFeatures: settings.newFeatures,
      teamActivity: settings.teamActivity,
      emailDigestFrequency: settings.emailDigestFrequency,
      webhookUrl: settings.webhookUrl,
    };
  }

  /**
   * Update appearance preferences in userSettings collection.
   */
  async updateAppearance(userId: string, dto: UpdateAppearanceDto) {
    const data: any = {};
    if (dto.theme !== undefined) data.theme = dto.theme;
    if (dto.sidebarDefault !== undefined)
      data.sidebarDefault = dto.sidebarDefault;
    if (dto.canvasGridStyle !== undefined)
      data.canvasGridStyle = dto.canvasGridStyle;
    if (dto.interfaceDensity !== undefined)
      data.interfaceDensity = dto.interfaceDensity;
    if (dto.soundEffects !== undefined)
      data.soundEffects = dto.soundEffects;

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });

    return {
      theme: settings.theme,
      sidebarDefault: settings.sidebarDefault,
      canvasGridStyle: settings.canvasGridStyle,
      interfaceDensity: settings.interfaceDensity,
      soundEffects: settings.soundEffects,
    };
  }

  /**
   * Update regional and localization settings in userSettings collection.
   */
  async updateRegion(userId: string, dto: UpdateRegionDto) {
    const data: any = {};
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.dateFormat !== undefined) data.dateFormat = dto.dateFormat;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.telemetryEnabled !== undefined)
      data.telemetryEnabled = dto.telemetryEnabled;
    if (dto.crashReportsEnabled !== undefined)
      data.crashReportsEnabled = dto.crashReportsEnabled;

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });

    return {
      timezone: settings.timezone,
      language: settings.language,
      dateFormat: settings.dateFormat,
      currency: settings.currency,
      telemetryEnabled: settings.telemetryEnabled,
      crashReportsEnabled: settings.crashReportsEnabled,
    };
  }

  /**
   * Verify current password and update with new hashed password in User collection.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { ok: true, message: 'Password changed successfully' };
  }

  /**
   * Toggle two-factor authentication flag for user in User collection.
   */
  async toggle2FA(userId: string, dto: Toggle2FaDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const nextState =
      dto.enabled !== undefined ? dto.enabled : !user.twoFactorEnabled;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: nextState },
    });

    return { twoFactorEnabled: updated.twoFactorEnabled };
  }

  /**
   * List personal access tokens for authenticated user.
   */
  async listApiTokens(userId: string) {
    return this.prisma.apiToken.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Generate a new personal access token and store hash in apiToken collection.
   */
  async createApiToken(userId: string, dto: CreateApiTokenDto) {
    const randomHex = crypto.randomBytes(24).toString('hex');
    const rawToken = `awas_pat_${randomHex}`;
    const tokenPrefix = `awas_pat_${randomHex.slice(0, 4)}...${randomHex.slice(-4)}`;
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const record = await this.prisma.apiToken.create({
      data: {
        userId,
        name: dto.name,
        tokenPrefix,
        tokenHash,
        scopes: dto.scopes && dto.scopes.length > 0 ? dto.scopes : ['all'],
        expiresAt,
      },
    });

    return {
      id: record.id,
      name: record.name,
      token: rawToken,
      tokenPrefix: record.tokenPrefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  /**
   * Revoke (delete) a personal access token by ID.
   */
  async revokeApiToken(userId: string, tokenId: string) {
    const token = await this.prisma.apiToken.findUnique({
      where: { id: tokenId },
    });
    if (!token) throw new NotFoundException('API token not found');
    if (token.userId !== userId) {
      throw new UnauthorizedException(
        'You do not have permission to revoke this token',
      );
    }

    await this.prisma.apiToken.delete({
      where: { id: tokenId },
    });

    return { ok: true, id: tokenId };
  }

  /**
   * Export all workspace data (settings, workflows, custom agents) as a portable bundle.
   */
  async exportWorkspaceData(userId: string) {
    const [settings, workflows, user] = await Promise.all([
      this.getSettings(userId),
      this.prisma.workflow.findMany({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, tokenBalance: true },
      }),
    ]);

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      user,
      settings,
      workflowsCount: workflows.length,
      workflows,
    };
  }

  /**
   * Reset user settings to platform factory defaults.
   */
  async resetSettings(userId: string) {
    await this.prisma.userSettings.deleteMany({ where: { userId } });
    return this.getSettings(userId);
  }
}
