import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublishMarketplaceItemDto } from './dto/publish-marketplace-item.dto';

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Publish or update an agent or workflow in the marketplace MongoDB collection.
   * Stores complete schema, metadata, and user/creator details.
   */
  async publish(dto: PublishMarketplaceItemDto, authUser?: any) {
    const rawId = dto.itemId || dto.id;
    const determinedType = dto.type || (rawId?.startsWith('wf-') ? 'workflow' : 'agent');
    const itemId = rawId || `${determinedType}-${Date.now()}`;

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
    const item = await (this.prisma as any).marketplaceItem.findFirst({
      where: {
        OR: [{ itemId }, { id: itemId }],
      },
    });

    if (!item) {
      throw new NotFoundException(`Marketplace item "${itemId}" not found`);
    }

    return item;
  }

  /**
   * Remove or unpublish an item from the marketplace.
   */
  async remove(itemId: string) {
    try {
      return await (this.prisma as any).marketplaceItem.delete({
        where: { itemId },
      });
    } catch {
      // Fallback by mongo id
      try {
        return await (this.prisma as any).marketplaceItem.delete({
          where: { id: itemId },
        });
      } catch {
        throw new NotFoundException(`Marketplace item "${itemId}" not found`);
      }
    }
  }
}
