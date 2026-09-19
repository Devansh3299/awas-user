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
          automationFailures: true,
          weeklyDigest: true,
          agentErrorAlerts: true,
          billingReminders: false,
          newFeatures: false,
          teamActivity: true,
          theme: 'Light',
          sidebarDefault: 'Expanded',
          timezone: 'UTC+05:30 – Mumbai, New Delhi',
          language: 'English (US)',
          dateFormat: 'MM/DD/YYYY',
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
      },
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
            website: user.organization.website || '',
            industry: user.organization.industry || 'Software & Technology',
          }
        : {
            id: '',
            name: 'Acme Corp',
            slug: 'acme-corp',
            website: 'https://acme.io',
            industry: 'Software & Technology',
          },
      notifications: {
        automationFailures: settings.automationFailures,
        weeklyDigest: settings.weeklyDigest,
        agentErrorAlerts: settings.agentErrorAlerts,
        billingReminders: settings.billingReminders,
        newFeatures: settings.newFeatures,
        teamActivity: settings.teamActivity,
      },
      appearance: {
        theme: settings.theme,
        sidebarDefault: settings.sidebarDefault,
      },
      region: {
        timezone: settings.timezone,
        language: settings.language,
        dateFormat: settings.dateFormat,
      },
      security: {
        twoFactorEnabled: !!user.twoFactorEnabled,
        apiTokensCount: user.apiTokens?.length || 0,
      },
    };
  }

  /**
   * Update personal profile info (name, jobTitle, bio, avatarUrl) in User collection.
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
   * Update or create organization settings and associate with user in MongoDB.
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
      // Check if slug exists, if so generate a unique suffix
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
    };
  }

  /**
   * Update notification preferences in userSettings collection.
   */
  async updateNotifications(userId: string, dto: UpdateNotificationsDto) {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(dto.automationFailures !== undefined && {
          automationFailures: dto.automationFailures,
        }),
        ...(dto.weeklyDigest !== undefined && {
          weeklyDigest: dto.weeklyDigest,
        }),
        ...(dto.agentErrorAlerts !== undefined && {
          agentErrorAlerts: dto.agentErrorAlerts,
        }),
        ...(dto.billingReminders !== undefined && {
          billingReminders: dto.billingReminders,
        }),
        ...(dto.newFeatures !== undefined && {
          newFeatures: dto.newFeatures,
        }),
        ...(dto.teamActivity !== undefined && {
          teamActivity: dto.teamActivity,
        }),
      },
      create: {
        userId,
        automationFailures: dto.automationFailures ?? true,
        weeklyDigest: dto.weeklyDigest ?? true,
        agentErrorAlerts: dto.agentErrorAlerts ?? true,
        billingReminders: dto.billingReminders ?? false,
        newFeatures: dto.newFeatures ?? false,
        teamActivity: dto.teamActivity ?? true,
      },
    });

    return {
      automationFailures: settings.automationFailures,
      weeklyDigest: settings.weeklyDigest,
      agentErrorAlerts: settings.agentErrorAlerts,
      billingReminders: settings.billingReminders,
      newFeatures: settings.newFeatures,
      teamActivity: settings.teamActivity,
    };
  }

  /**
   * Update appearance preferences (theme, sidebarDefault) in userSettings collection.
   */
  async updateAppearance(userId: string, dto: UpdateAppearanceDto) {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(dto.theme !== undefined && { theme: dto.theme }),
        ...(dto.sidebarDefault !== undefined && {
          sidebarDefault: dto.sidebarDefault,
        }),
      },
      create: {
        userId,
        theme: dto.theme ?? 'Light',
        sidebarDefault: dto.sidebarDefault ?? 'Expanded',
      },
    });

    return {
      theme: settings.theme,
      sidebarDefault: settings.sidebarDefault,
    };
  }

  /**
   * Update regional settings (timezone, language, dateFormat) in userSettings collection.
   */
  async updateRegion(userId: string, dto: UpdateRegionDto) {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dto.dateFormat !== undefined && { dateFormat: dto.dateFormat }),
      },
      create: {
        userId,
        timezone: dto.timezone ?? 'UTC+05:30 – Mumbai, New Delhi',
        language: dto.language ?? 'English (US)',
        dateFormat: dto.dateFormat ?? 'MM/DD/YYYY',
      },
    });

    return {
      timezone: settings.timezone,
      language: settings.language,
      dateFormat: settings.dateFormat,
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
   * List personal access tokens for authenticated user (excluding hashes).
   */
  async listApiTokens(userId: string) {
    return this.prisma.apiToken.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Generate a new personal access token and store hash in apiToken collection.
   * Returns plaintext token once to caller.
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
        expiresAt,
      },
    });

    return {
      id: record.id,
      name: record.name,
      token: rawToken,
      tokenPrefix: record.tokenPrefix,
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
}
