import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentMetadataService, isValidObjectId } from '../agents/agent-metadata.service';
import { AgentsService } from '../agents/agents.service';
import { PublishMarketplaceItemDto } from './dto/publish-marketplace-item.dto';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentMetadata: AgentMetadataService,
    private readonly agentsService: AgentsService,
  ) {}

  private formatPublishedAgentAsMarketplaceItem(agent: any, currentUserId?: string | null) {
    const schema = (agent.schema ?? {}) as Record<string, any>;
    const installedBy = Array.isArray(agent.installedBy) ? agent.installedBy : [];
    const ownerName = agent.owner?.name || agent.owner?.email?.split('@')[0] || 'Creator';
    const ownerEmail = agent.owner?.email || '';
    const handle = ownerEmail ? ownerEmail.split('@')[0] : ownerName.toLowerCase().replace(/\s+/g, '');
    const uid = currentUserId ? String(currentUserId) : null;
    const ownerId = agent.ownerId ? String(agent.ownerId) : null;

    return {
      id: agent.mastraAgentId,
      itemId: agent.mastraAgentId,
      mastraAgentId: agent.mastraAgentId,
      dbId: agent.id,
      type: 'agent',
      name: agent.name,
      description: agent.description || '',
      category: agent.category || schema.type || 'Assistant',
      price: agent.price || 'Free',
      rating: agent.rating || '5.0',
      userId: ownerId,
      ownerId,
      organizationId: agent.organizationId ? String(agent.organizationId) : null,
      owner: {
        name: ownerName,
        email: ownerEmail,
      },
      username: handle,
      displayName: ownerName,
      userEmail: ownerEmail,
      data: {
        ...schema,
        model: schema.modelId || schema.model || 'google/gemma-4-12b-qat',
        type: agent.category || schema.type || 'Assistant',
        instructions: schema.instructions || schema.systemPrompt || '',
        tools: schema.tools || [],
      },
      tags: Array.isArray(agent.tags) ? agent.tags : [],
      isPublished: Boolean(agent.isPublished),
      publishedAt: agent.publishedAt || agent.createdAt,
      lastPublishedAt: agent.lastPublishedAt || agent.updatedAt,
      installedBy: installedBy.map((r: any) => ({
        userId: String(r.userId),
        userName: r.userName || '',
        userEmail: r.userEmail || '',
        installedAt: r.installedAt,
      })),
      installedCount: installedBy.length,
      isOwner: Boolean(uid && ownerId && ownerId === uid),
      isInstalled: Boolean(uid && installedBy.some((r: any) => String(r.userId) === uid)),
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }

  /**
   * Publish or re-publish an agent (stored in MongoDB `Agent`) or workflow (`MarketplaceItem`).
   * Strictly enforces original `ownerId`.
   */
  async publish(dto: PublishMarketplaceItemDto, authUser?: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required to publish to the Marketplace.');
    }

    const rawId = dto.itemId || dto.id;
    const determinedType = dto.type || (rawId?.startsWith('wf-') ? 'workflow' : 'agent');

    // ── Agents: Authoritative MongoDB `Agent` collection ─────────────────────
    if (determinedType === 'agent') {
      const existingAgent = rawId ? await this.agentMetadata.findByMastraIdOrId(rawId) : null;

      if (existingAgent) {
        const updated = await this.agentMetadata.publishAgent(existingAgent.mastraAgentId, authUser.id, {
          name: dto.name,
          description: dto.description,
          category: dto.category,
          price: dto.price ?? 'Free',
          rating: dto.rating ?? '5.0',
          tags: dto.tags,
          schema: dto.data && typeof dto.data === 'object' ? dto.data : undefined,
          isPublished: true,
        });
        return this.formatPublishedAgentAsMarketplaceItem(updated, authUser.id);
      }

      // Brand-new agent created & published directly from the Marketplace modal
      const created = await this.agentsService.create(
        {
          name: dto.name,
          mastraId: rawId || undefined,
          description: dto.description || '',
          schema: {
            ...(dto.data && typeof dto.data === 'object' ? dto.data : {}),
            instructions:
              dto.data?.instructions ||
              dto.data?.systemPrompt ||
              `You are ${dto.name}, an autonomous AI specialist.`,
            modelId: dto.data?.model || dto.data?.modelId || 'google/gemma-4-12b-qat',
            type: dto.category || 'Assistant',
            source: 'repository',
          },
        },
        authUser.id,
      );

      const published = await this.agentMetadata.publishAgent(created.mastraAgentId, authUser.id, {
        name: dto.name,
        description: dto.description,
        category: dto.category || 'Assistant',
        price: dto.price ?? 'Free',
        rating: dto.rating ?? '5.0',
        tags: dto.tags ?? [],
        isPublished: true,
      });

      return this.formatPublishedAgentAsMarketplaceItem(published, authUser.id);
    }

    // ── Workflows: MongoDB `MarketplaceItem` collection ──────────────────────
    const itemId = rawId || `workflow-${Date.now()}`;
    const existingListing = await this.prisma.marketplaceItem.findUnique({
      where: { itemId },
    });
    if (existingListing?.userId && String(existingListing.userId) !== String(authUser.id)) {
      throw new ForbiddenException(
        'Only the original owner can re-publish or update this marketplace workflow.',
      );
    }

    const identity = await this.agentMetadata.resolveUserIdentity(authUser.id);
    const resolvedUsername = identity.owner.email
      ? identity.owner.email.split('@')[0]
      : dto.username || 'creator';

    return this.prisma.marketplaceItem.upsert({
      where: { itemId },
      update: {
        name: dto.name,
        description: dto.description ?? '',
        category: dto.category ?? 'Workflow',
        price: dto.price ?? 'Free',
        rating: dto.rating ?? '5.0',
        type: 'workflow',
        data: dto.data !== undefined ? dto.data : {},
        tags: dto.tags ?? [],
        username: resolvedUsername,
        displayName: identity.owner.name,
        userEmail: identity.owner.email,
        userId: identity.ownerId,
        isPublished: true,
      },
      create: {
        itemId,
        type: 'workflow',
        name: dto.name,
        description: dto.description ?? '',
        category: dto.category ?? 'Workflow',
        price: dto.price ?? 'Free',
        rating: dto.rating ?? '5.0',
        userId: identity.ownerId,
        username: resolvedUsername,
        displayName: identity.owner.name,
        userEmail: identity.owner.email,
        data: dto.data !== undefined ? dto.data : {},
        tags: dto.tags ?? [],
        isPublished: true,
      },
    });
  }

  /**
   * Retrieve all published Marketplace items across all users:
   * - Published Agents (`isPublished: true`) from MongoDB `Agent` collection
   * - Published Workflows (`isPublished: true, type: 'workflow'`) from `MarketplaceItem`
   */
  async findAll(
    filters?: { type?: string; category?: string; search?: string },
    currentUserId?: string | null,
  ) {
    const normalizedType = filters?.type ? filters.type.toLowerCase() : 'all';
    const wantAgents = normalizedType === 'all' || normalizedType.includes('agent');
    const wantWorkflows = normalizedType === 'all' || normalizedType.includes('workflow');

    const [publishedAgents, publishedWorkflows] = await Promise.all([
      wantAgents
        ? this.agentMetadata.listPublishedAgents({
            category: filters?.category,
            search: filters?.search,
          })
        : Promise.resolve([]),
      wantWorkflows
        ? this.prisma.marketplaceItem.findMany({
            where: {
              isPublished: true,
              type: 'workflow',
              ...(filters?.category && filters.category !== 'All'
                ? { category: filters.category }
                : {}),
            },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const agentItems = publishedAgents.map((a) =>
      this.formatPublishedAgentAsMarketplaceItem(a, currentUserId),
    );

    let workflowItems = publishedWorkflows as any[];
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      workflowItems = workflowItems.filter(
        (item: any) =>
          item.name?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.username?.toLowerCase().includes(q),
      );
    }

    return [...agentItems, ...workflowItems];
  }

  async findOne(itemId: string, currentUserId?: string | null) {
    const agent = await this.agentMetadata.findByMastraIdOrId(itemId);
    if (agent && agent.isPublished) {
      return this.formatPublishedAgentAsMarketplaceItem(agent, currentUserId);
    }

    const wfItem = await this.prisma.marketplaceItem.findFirst({
      where: isValidObjectId(itemId) ? { OR: [{ itemId }, { id: itemId }] } : { itemId },
    });
    if (wfItem) {
      return wfItem;
    }

    throw new NotFoundException(`Marketplace item "${itemId}" not found`);
  }

  /**
   * Unpublish / remove an item from Marketplace (owner-only).
   */
  async remove(itemId: string, authUser?: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required.');
    }

    const agent = await this.agentMetadata.findByMastraIdOrId(itemId);
    if (agent) {
      const updated = await this.agentMetadata.unpublishAgent(agent.mastraAgentId, authUser.id);
      return { success: true, itemId: updated.mastraAgentId, isPublished: false };
    }

    const existing = await this.prisma.marketplaceItem.findFirst({
      where: isValidObjectId(itemId) ? { OR: [{ itemId }, { id: itemId }] } : { itemId },
    });
    if (!existing) {
      throw new NotFoundException(`Marketplace item "${itemId}" not found`);
    }
    if (existing.userId && String(existing.userId) !== String(authUser.id)) {
      throw new ForbiddenException(
        'Only the original owner can unpublish or remove this marketplace item.',
      );
    }
    return this.prisma.marketplaceItem.delete({ where: { id: existing.id } });
  }

  /**
   * Install a published Marketplace agent into the user's personal Repository by
   * recording the user in `Agent.installedBy` in MongoDB.
   */
  async installItem(itemId: string, authUser: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required to install marketplace items.');
    }

    const agent = await this.agentMetadata.findByMastraIdOrId(itemId);
    if (agent) {
      const res = await this.agentMetadata.installAgent(agent.mastraAgentId, authUser.id);
      return {
        success: true,
        alreadyInstalled: res.alreadyInstalled,
        itemId: res.agent.mastraAgentId,
        item: this.formatPublishedAgentAsMarketplaceItem(res.agent, authUser.id),
      };
    }

    // Workflow fallback
    const wfItem = await this.prisma.marketplaceItem.findFirst({
      where: isValidObjectId(itemId) ? { OR: [{ itemId }, { id: itemId }] } : { itemId },
    });
    if (!wfItem || !wfItem.isPublished) {
      throw new NotFoundException(`Published marketplace item "${itemId}" not found.`);
    }

    return { success: true, itemId: wfItem.itemId, item: wfItem };
  }

  /**
   * Uninstall a Marketplace agent from the current user's personal Repository
   * by removing them from `Agent.installedBy` in MongoDB.
   */
  async uninstallItem(itemId: string, authUser: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required.');
    }
    return this.agentMetadata.uninstallAgent(itemId, authUser.id);
  }

  /**
   * List all agents installed from the Marketplace by the current user (`installedBy`).
   */
  async getInstalledItems(authUser: any) {
    if (!authUser?.id || !isValidObjectId(authUser.id)) {
      return [];
    }

    const installedAgents = await this.prisma.agent.findMany({
      where: {
        installedBy: {
          some: { userId: authUser.id },
        },
      },
      select: {
        id: true,
        mastraAgentId: true,
        name: true,
        ownerId: true,
        installedBy: true,
      },
    });

    return installedAgents.map((a) => {
      const entry = (a.installedBy || []).find((r) => String(r.userId) === String(authUser.id));
      return {
        itemId: a.mastraAgentId,
        mastraAgentId: a.mastraAgentId,
        name: a.name,
        itemType: 'agent',
        ownerId: a.ownerId ? String(a.ownerId) : null,
        installedAt: entry?.installedAt || null,
      };
    });
  }

  /**
   * Submit an update/change request directly to the agent's original owner.
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
      throw new BadRequestException('Update request message is required.');
    }

    const agent = await this.agentMetadata.findByMastraIdOrId(itemId);
    if (!agent) {
      throw new NotFoundException(`Agent "${itemId}" not found.`);
    }

    const requester = await this.agentMetadata.resolveUserIdentity(authUser.id);

    return this.prisma.agentUpdateRequest.create({
      data: {
        mastraAgentId: agent.mastraAgentId,
        agentName: body?.agentName || agent.name || agent.mastraAgentId,
        requesterId: requester.ownerId,
        requesterEmail: requester.owner.email,
        requesterName: requester.owner.name,
        ownerId: agent.ownerId || null,
        title: String(body?.title || '').trim() || `Update request for ${agent.name}`,
        message,
        status: 'pending',
      },
    });
  }

  /**
   * List update requests relevant to the current user (incoming as owner, or outgoing as requester).
   */
  async listUpdateRequests(authUser: any, itemId?: string) {
    if (!authUser?.id || !isValidObjectId(authUser.id)) {
      return [];
    }
    return this.prisma.agentUpdateRequest.findMany({
      where: {
        OR: [{ ownerId: authUser.id }, { requesterId: authUser.id }],
        ...(itemId ? { mastraAgentId: itemId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Mark an update request as reviewed/resolved (strictly owner-only).
   */
  async updateRequestStatus(requestId: string, status: string, authUser: any) {
    if (!authUser?.id) {
      throw new UnauthorizedException('Authentication required.');
    }
    if (!isValidObjectId(requestId)) {
      throw new NotFoundException(`Update request "${requestId}" not found.`);
    }
    const existing = await this.prisma.agentUpdateRequest.findUnique({
      where: { id: requestId },
    });
    if (!existing) {
      throw new NotFoundException(`Update request "${requestId}" not found.`);
    }
    if (!existing.ownerId || String(existing.ownerId) !== String(authUser.id)) {
      throw new ForbiddenException('Only the original owner can update request status.');
    }
    const allowedStatuses = new Set(['pending', 'reviewed', 'resolved']);
    const nextStatus = allowedStatuses.has(status) ? status : 'reviewed';
    return this.prisma.agentUpdateRequest.update({
      where: { id: requestId },
      data: { status: nextStatus },
    });
  }
}
