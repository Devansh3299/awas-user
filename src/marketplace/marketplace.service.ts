import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublishMarketplaceItemDto } from './dto/publish-marketplace-item.dto';
import { getMastraBaseUrl } from '../config/mastra.config';

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveMastraAgentOwner(itemId: string): Promise<string | null> {
    try {
      const res = await fetch(`${getMastraBaseUrl()}/api/stored/agents/${encodeURIComponent(itemId)}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      const stored: any = await res.json().catch(() => null);
      return stored?.authorId || stored?.userId || stored?.metadata?.userId || null;
    } catch {
      return null;
    }
  }

  /**
   * Publish or re-publish an agent or workflow in the marketplace MongoDB collection.
   * Only the original owner can publish or push updates to an existing listing.
   */
  async publish(dto: PublishMarketplaceItemDto, authUser?: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required to publish to the Marketplace.');
    }

    const rawId = dto.itemId || dto.id;
    const determinedType = dto.type || (rawId?.startsWith('wf-') ? 'workflow' : 'agent');
    const itemId = rawId || `${determinedType}-${Date.now()}`;

    const existingListing = await (this.prisma as any).marketplaceItem.findUnique({
      where: { itemId },
    });
    if (existingListing?.userId && String(existingListing.userId) !== String(authUser.id)) {
      throw new ForbiddenException('Only the original owner can re-publish or update this marketplace listing.');
    }

    if (determinedType === 'agent' && rawId) {
      const mastraOwnerId = await this.resolveMastraAgentOwner(rawId);
      if (mastraOwnerId && String(mastraOwnerId) !== String(authUser.id)) {
        throw new ForbiddenException('Only the original owner can publish this agent to the Marketplace.');
      }
    }

    let resolvedUsername = dto.username || 'creator';
    let resolvedDisplayName = dto.displayName || 'Creator';
    let resolvedUserEmail = dto.userEmail || '';
    let resolvedUserId: string | null = null;

    if (authUser?.id) {
      resolvedUserId = authUser.id;
      try {
        const dbUser = await this.prisma.user.findUnique({
          where: { id: authUser.id },
          select: { name: true, email: true },
        });
        if (dbUser) {
          resolvedUserEmail = dbUser.email || resolvedUserEmail;
          resolvedUsername = dbUser.email ? dbUser.email.split('@')[0] : resolvedUsername;
          resolvedDisplayName = dbUser.name || (dbUser.email ? dbUser.email.split('@')[0] : resolvedDisplayName);
        }
      } catch (err) {
        console.warn('[MarketplaceService] Failed to enrich user details from DB', err);
      }
    }

    // Ensure entire data payload is preserved
    const dataPayload = dto.data !== undefined ? dto.data : {};

    const itemData = {
      itemId,
      type: determinedType,
      name: dto.name,
      description: dto.description ?? '',
      category: dto.category ?? 'General',
      price: dto.price ?? 'Free',
      rating: dto.rating ?? '5.0',
      userId: resolvedUserId,
      username: resolvedUsername,
      displayName: resolvedDisplayName,
      userEmail: resolvedUserEmail,
      data: dataPayload,
      tags: dto.tags ?? [],
      isPublished: true,
    };

    return (this.prisma as any).marketplaceItem.upsert({
      where: { itemId },
      update: {
        name: itemData.name,
        description: itemData.description,
        category: itemData.category,
        price: itemData.price,
        rating: itemData.rating,
        type: itemData.type,
        data: itemData.data,
        tags: itemData.tags,
        username: itemData.username,
        displayName: itemData.displayName,
        userEmail: itemData.userEmail,
        ...(resolvedUserId ? { userId: resolvedUserId } : {}),
        isPublished: true,
      },
      create: itemData,
    });
  }

  /**
   * Retrieve all published marketplace items for all users.
   */
  async findAll(filters?: { type?: string; category?: string; search?: string }) {
    const where: any = { isPublished: true };

    if (filters?.type && filters.type !== 'All') {
      const normalizedType = filters.type.toLowerCase();
      if (normalizedType.includes('workflow')) {
        where.type = 'workflow';
      } else if (normalizedType.includes('agent')) {
        where.type = 'agent';
      }
    }

    if (filters?.category && filters.category !== 'All') {
      where.category = filters.category;
    }

    const items = await (this.prisma as any).marketplaceItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      return items.filter(
        (item: any) =>
          item.name?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.username?.toLowerCase().includes(q),
      );
    }

    return items;
  }

  /**
   * Retrieve a single marketplace item by itemId or id.
   */
  async findOne(itemId: string) {
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(itemId);
    const item = await (this.prisma as any).marketplaceItem.findFirst({
      where: isValidObjectId
        ? { OR: [{ itemId }, { id: itemId }] }
        : { itemId },
    });

    if (!item) {
      throw new NotFoundException(`Marketplace item "${itemId}" not found`);
    }

    return item;
  }

  /**
   * Remove or unpublish an item from the marketplace (owner-only).
   */
  async remove(itemId: string, authUser?: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required.');
    }
    const existing = await this.findOne(itemId);
    if (existing.userId && String(existing.userId) !== String(authUser.id)) {
      throw new ForbiddenException('Only the original owner can unpublish or remove this marketplace item.');
    }
    return (this.prisma as any).marketplaceItem.delete({
      where: { id: existing.id },
    });
  }

  /**
   * Install a published marketplace item into the current user's personal repository.
   */
  async installItem(itemId: string, authUser: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required to install marketplace items.');
    }
    const item = await this.findOne(itemId);
    if (!item.isPublished) {
      throw new ForbiddenException('This marketplace item is not currently published.');
    }

    const canonicalId = item.itemId || item.id;
    const install = await (this.prisma as any).marketplaceInstall.upsert({
      where: {
        userId_itemId: {
          userId: authUser.id,
          itemId: canonicalId,
        },
      },
      create: {
        userId: authUser.id,
        itemId: canonicalId,
        itemType: item.type || 'agent',
        ownerId: item.userId || null,
      },
      update: {
        itemType: item.type || 'agent',
        ownerId: item.userId || null,
      },
    });

    return { success: true, install, item };
  }

  /**
   * List all marketplace items installed by the current user.
   */
  async getInstalledItems(authUser: any, type?: string) {
    if (!authUser?.id) {
      return [];
    }
    return (this.prisma as any).marketplaceInstall.findMany({
      where: {
        userId: authUser.id,
        ...(type ? { itemType: type } : {}),
      },
      orderBy: { installedAt: 'desc' },
    });
  }

  /**
   * Uninstall a marketplace item from the current user's personal repository.
   */
  async uninstallItem(itemId: string, authUser: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required.');
    }
    await (this.prisma as any).marketplaceInstall.deleteMany({
      where: {
        userId: authUser.id,
        itemId,
      },
    });
    return { success: true, itemId };
  }

  /**
   * Submit an update/change request from an installed-agent user to the original owner.
   */
  async createUpdateRequest(
    itemId: string,
    body: { title?: string; message?: string; agentName?: string },
    authUser: any,
  ) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required to submit an update request.');
    }
    const message = String(body?.message || '').trim();
    if (!message) {
      throw new ForbiddenException('Update request message is required.');
    }

    const item = await (this.prisma as any).marketplaceItem
      .findFirst({ where: { OR: [{ itemId }, { id: itemId }] } })
      .catch(() => null);
    const ownerId = item?.userId || (await this.resolveMastraAgentOwner(itemId)) || null;

    let requesterName = authUser.name || '';
    let requesterEmail = authUser.email || '';
    try {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: authUser.id },
        select: { name: true, email: true },
      });
      if (dbUser) {
        requesterName = dbUser.name || requesterName;
        requesterEmail = dbUser.email || requesterEmail;
      }
    } catch {}

    return (this.prisma as any).agentUpdateRequest.create({
      data: {
        itemId: item?.itemId || itemId,
        agentName: body?.agentName || item?.name || itemId,
        requesterId: authUser.id,
        requesterEmail,
        requesterName: requesterName || requesterEmail || 'User',
        ownerId,
        title: String(body?.title || '').trim() || 'Update Request',
        message,
        status: 'pending',
      },
    });
  }

  /**
   * List update requests relevant to the current user (either as owner or requester).
   */
  async listUpdateRequests(authUser: any, itemId?: string) {
    if (!authUser?.id) {
      return [];
    }
    return (this.prisma as any).agentUpdateRequest.findMany({
      where: {
        OR: [{ ownerId: authUser.id }, { requesterId: authUser.id }],
        ...(itemId ? { itemId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update the status of an update request (owner-only).
   */
  async updateRequestStatus(requestId: string, status: string, authUser: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required.');
    }
    const existing = await (this.prisma as any).agentUpdateRequest.findUnique({
      where: { id: requestId },
    });
    if (!existing) {
      throw new NotFoundException(`Update request "${requestId}" not found`);
    }
    if (existing.ownerId && String(existing.ownerId) !== String(authUser.id)) {
      throw new ForbiddenException('Only the original owner can update request status.');
    }
    return (this.prisma as any).agentUpdateRequest.update({
      where: { id: requestId },
      data: { status: status || 'reviewed' },
    });
  }
}
