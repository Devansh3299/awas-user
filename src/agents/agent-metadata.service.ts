import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const SYSTEM_AGENT_IDS = new Set([
  'agent-builder-agent',
  'studio-chat-agent',
  'agent-builder',
  'studio-chat',
]);

export function isSystemAgentId(id?: string | null): boolean {
  if (!id) return false;
  return SYSTEM_AGENT_IDS.has(String(id).trim().toLowerCase());
}

export function isValidObjectId(value?: string | null): boolean {
  return Boolean(value && /^[0-9a-fA-F]{24}$/.test(String(value)));
}

export interface UpsertAgentMetadataInput {
  name: string;
  description?: string | null;
  category?: string | null;
  price?: string | null;
  tags?: string[];
  version?: string | null;
  schema?: Record<string, any>;
  source?: string;
  clonedFrom?: string | null;
}

@Injectable()
export class AgentMetadataService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUserIdentity(userId: string): Promise<{
    ownerId: string;
    organizationId: string | null;
    owner: { name: string; email: string };
  }> {
    if (!isValidObjectId(userId)) {
      throw new UnauthorizedException('Invalid authenticated user identity.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, organizationId: true },
    });
    if (!user) {
      throw new UnauthorizedException('Authenticated user account not found.');
    }
    const email = user.email || '';
    const displayName = user.name || (email ? email.split('@')[0] : 'Creator');
    return {
      ownerId: user.id,
      organizationId: user.organizationId || null,
      owner: {
        name: displayName,
        email,
      },
    };
  }

  async findByMastraIdOrId(idOrMastraId: string) {
    if (!idOrMastraId) return null;
    const trimmed = String(idOrMastraId).trim();

    let agent = await this.prisma.agent.findUnique({
      where: { mastraAgentId: trimmed },
    });
    if (agent) return agent;

    if (isValidObjectId(trimmed)) {
      agent = await this.prisma.agent.findUnique({
        where: { id: trimmed },
      });
      if (agent) return agent;
    }

    agent = await this.prisma.agent.findFirst({
      where: { name: trimmed },
    });
    return agent;
  }

  async listUserAccessibleAgents(userId: string) {
    if (!isValidObjectId(userId)) {
      return [];
    }
    return this.prisma.agent.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { installedBy: { some: { userId } } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listPublishedAgents(filters?: { category?: string; search?: string }) {
    const where: any = { isPublished: true };
    if (filters?.category && filters.category !== 'All') {
      where.category = filters.category;
    }

    const agents = await this.prisma.agent.findMany({
      where,
      orderBy: [{ lastPublishedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      return agents.filter(
        (a) =>
          a.name?.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.owner?.name?.toLowerCase().includes(q) ||
          a.owner?.email?.toLowerCase().includes(q) ||
          a.mastraAgentId?.toLowerCase().includes(q),
      );
    }

    return agents;
  }

  async assertOwnership(idOrMastraId: string, userId?: string, requireExists = false) {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Authentication required to modify this agent.');
    }

    const record = await this.findByMastraIdOrId(idOrMastraId);
    if (!record) {
      if (requireExists) {
        throw new NotFoundException(`Agent "${idOrMastraId}" not found.`);
      }
      return null;
    }

    if (!record.ownerId || String(record.ownerId) !== String(userId)) {
      throw new ForbiddenException(
        'Only the original owner can edit, delete, or re-publish this agent.',
      );
    }

    return record;
  }

  async assertAccess(idOrMastraId: string, userId?: string) {
    if (isSystemAgentId(idOrMastraId)) {
      return { allowed: true, record: null, isOwner: false, isInstalled: false };
    }

    const record = await this.findByMastraIdOrId(idOrMastraId);
    if (!record) {
      return { allowed: true, record: null, isOwner: false, isInstalled: false };
    }

    const uid = userId ? String(userId) : null;
    const isOwner = Boolean(uid && record.ownerId && String(record.ownerId) === uid);
    const isInstalled = Boolean(
      uid &&
        Array.isArray(record.installedBy) &&
        record.installedBy.some((entry) => String(entry.userId) === uid),
    );
    const isPublished = Boolean(record.isPublished);

    if (!isOwner && !isInstalled && !isPublished) {
      throw new ForbiddenException('You do not have permission to access this private agent.');
    }

    return { allowed: true, record, isOwner, isInstalled };
  }

  async upsertAgentMetadata(
    mastraAgentId: string,
    userId: string,
    input: UpsertAgentMetadataInput,
  ) {
    const cleanMastraId = String(mastraAgentId || '').trim();
    if (!cleanMastraId) {
      throw new BadRequestException('mastraAgentId is required.');
    }

    const existing = await this.findByMastraIdOrId(cleanMastraId);
    if (existing) {
      if (existing.ownerId && String(existing.ownerId) !== String(userId)) {
        throw new ForbiddenException('Only the original owner can update this agent.');
      }

      const mergedSchema = {
        ...((existing.schema as Record<string, any>) ?? {}),
        ...(input.schema ?? {}),
      };

      return this.prisma.agent.update({
        where: { id: existing.id },
        data: {
          name: input.name || existing.name,
          description: input.description !== undefined ? input.description : existing.description,
          category: input.category !== undefined ? input.category : existing.category,
          price: input.price !== undefined ? input.price : existing.price,
          tags: input.tags !== undefined ? input.tags : existing.tags,
          version: input.version || existing.version,
          schema: mergedSchema,
        },
      });
    }

    const identity = await this.resolveUserIdentity(userId);
    return this.prisma.agent.create({
      data: {
        mastraAgentId: cleanMastraId,
        name: input.name || cleanMastraId,
        description: input.description ?? '',
        category: input.category ?? 'Assistant',
        price: input.price ?? 'Free',
        tags: input.tags ?? [],
        version: input.version ?? '1.0.0',
        schema: input.schema ?? {},
        ownerId: identity.ownerId,
        organizationId: identity.organizationId,
        owner: identity.owner,
        isPublished: false,
        installedBy: [],
        clonedFrom: input.clonedFrom ?? null,
        source: input.source ?? 'repository',
      },
    });
  }

  async deleteAgentMetadata(idOrMastraId: string, userId: string) {
    const record = await this.assertOwnership(idOrMastraId, userId, false);
    if (!record) return null;

    await this.prisma.agent.delete({ where: { id: record.id } });
    // Remove any legacy marketplaceItem entry if present
    await this.prisma.marketplaceItem
      .deleteMany({ where: { itemId: record.mastraAgentId, type: 'agent' } })
      .catch(() => {});
    return record;
  }

  async publishAgent(
    idOrMastraId: string,
    userId: string,
    dto: {
      name?: string;
      description?: string;
      category?: string;
      price?: string;
      rating?: string;
      tags?: string[];
      schema?: Record<string, any>;
      isPublished?: boolean;
    },
  ) {
    const existing = await this.assertOwnership(idOrMastraId, userId, true);
    if (!existing) {
      throw new NotFoundException(`Agent "${idOrMastraId}" not found.`);
    }

    const shouldPublish = dto.isPublished !== false;
    const now = new Date();
    const mergedSchema = {
      ...((existing.schema as Record<string, any>) ?? {}),
      ...(dto.schema ?? {}),
    };

    const updated = await this.prisma.agent.update({
      where: { id: existing.id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.rating ? { rating: dto.rating } : {}),
        ...(Array.isArray(dto.tags) ? { tags: dto.tags } : {}),
        schema: mergedSchema,
        isPublished: shouldPublish,
        ...(shouldPublish
          ? {
              publishedAt: existing.publishedAt ?? now,
              lastPublishedAt: now,
            }
          : {}),
      },
    });

    // Clean up any legacy duplicate in marketplaceItem so Marketplace reads cleanly from Agent
    await this.prisma.marketplaceItem
      .deleteMany({ where: { itemId: updated.mastraAgentId, type: 'agent' } })
      .catch(() => {});

    return updated;
  }

  async unpublishAgent(idOrMastraId: string, userId: string) {
    return this.publishAgent(idOrMastraId, userId, { isPublished: false });
  }

  async installAgent(idOrMastraId: string, userId: string) {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Authentication required to install an agent.');
    }

    const record = await this.findByMastraIdOrId(idOrMastraId);
    if (!record) {
      throw new NotFoundException(`Agent "${idOrMastraId}" not found.`);
    }

    const isOwner = record.ownerId && String(record.ownerId) === String(userId);
    if (!record.isPublished && !isOwner) {
      throw new ForbiddenException('This agent is not published in the Marketplace.');
    }

    const existingList = Array.isArray(record.installedBy) ? record.installedBy : [];
    const alreadyInstalled = existingList.some((entry) => String(entry.userId) === String(userId));

    if (alreadyInstalled) {
      return { success: true, alreadyInstalled: true, agent: record };
    }

    const installer = await this.resolveUserIdentity(userId);
    const updated = await this.prisma.agent.update({
      where: { id: record.id },
      data: {
        installedBy: {
          push: {
            userId: installer.ownerId,
            userName: installer.owner.name,
            userEmail: installer.owner.email,
            installedAt: new Date(),
          },
        },
      },
    });

    return { success: true, alreadyInstalled: false, agent: updated };
  }

  async uninstallAgent(idOrMastraId: string, userId: string) {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Authentication required to uninstall an agent.');
    }

    const record = await this.findByMastraIdOrId(idOrMastraId);
    if (!record) {
      throw new NotFoundException(`Agent "${idOrMastraId}" not found.`);
    }

    const existingList = Array.isArray(record.installedBy) ? record.installedBy : [];
    const filtered = existingList.filter((entry) => String(entry.userId) !== String(userId));

    const updated = await this.prisma.agent.update({
      where: { id: record.id },
      data: {
        installedBy: {
          set: filtered,
        },
      },
    });

    return { success: true, mastraAgentId: record.mastraAgentId, agent: updated };
  }

  formatAgentView(dbAgent: any, runtimeAgent: any = null, currentUserId?: string | null) {
    const schema = (dbAgent?.schema ?? {}) as Record<string, any>;
    const installedBy = Array.isArray(dbAgent?.installedBy) ? dbAgent.installedBy : [];
    const uid = currentUserId ? String(currentUserId) : null;
    const ownerId = dbAgent?.ownerId ? String(dbAgent.ownerId) : null;
    const isOwner = Boolean(uid && ownerId && ownerId === uid);
    const isInstalled = Boolean(uid && installedBy.some((r: any) => String(r.userId) === uid));

    const runtimeTools = runtimeAgent?.tools;
    let toolsObj: Record<string, any> = {};
    if (runtimeTools && typeof runtimeTools === 'object' && !Array.isArray(runtimeTools)) {
      toolsObj = runtimeTools;
    } else if (Array.isArray(runtimeTools)) {
      for (const t of runtimeTools) {
        const tid = typeof t === 'string' ? t : t?.id || t?.name;
        if (tid) toolsObj[tid] = typeof t === 'object' ? t : { id: tid, name: tid };
      }
    } else if (Array.isArray(schema.tools)) {
      for (const t of schema.tools) {
        const tid = typeof t === 'string' ? t : t?.id || t?.name;
        if (tid) toolsObj[tid] = typeof t === 'object' ? t : { id: tid, name: tid };
      }
    } else if (schema.tools && typeof schema.tools === 'object') {
      toolsObj = schema.tools;
    }

    const rawWorkflows = runtimeAgent?.workflows ?? schema.workflows ?? {};
    const workflowsCount = Array.isArray(rawWorkflows)
      ? rawWorkflows.length
      : typeof rawWorkflows === 'object' && rawWorkflows !== null
        ? Object.keys(rawWorkflows).length
        : 0;

    const rawSubagents = runtimeAgent?.agents ?? schema.agents ?? {};
    const subagentsCount = Array.isArray(rawSubagents)
      ? rawSubagents.length
      : typeof rawSubagents === 'object' && rawSubagents !== null
        ? Object.keys(rawSubagents).length
        : 0;

    const ownerName = dbAgent?.owner?.name || dbAgent?.owner?.email?.split('@')[0] || 'Creator';
    const ownerEmail = dbAgent?.owner?.email || '';

    return {
      ...(runtimeAgent ?? {}),
      id: dbAgent?.mastraAgentId || runtimeAgent?.id,
      mastraAgentId: dbAgent?.mastraAgentId || runtimeAgent?.id,
      dbId: dbAgent?.id || null,
      name: dbAgent?.name || runtimeAgent?.name || dbAgent?.mastraAgentId,
      description: dbAgent?.description ?? runtimeAgent?.description ?? '',
      category: dbAgent?.category || schema.type || runtimeAgent?.provider || 'Assistant',
      type: dbAgent?.category || schema.type || runtimeAgent?.provider || 'Assistant',
      price: dbAgent?.price || 'Free',
      rating: dbAgent?.rating || '5.0',
      tags: Array.isArray(dbAgent?.tags) ? dbAgent.tags : [],
      version: dbAgent?.version || '1.0.0',
      instructions:
        runtimeAgent?.instructions ||
        runtimeAgent?.initialInstructions ||
        schema.instructions ||
        schema.systemPrompt ||
        '',
      modelId: runtimeAgent?.modelId || schema.modelId || schema.model || 'google/gemma-4-12b-qat',
      model: runtimeAgent?.modelId || schema.modelId || schema.model || 'google/gemma-4-12b-qat',
      provider: runtimeAgent?.provider || schema.provider || 'lm-studio',
      tools: toolsObj,
      workflows: rawWorkflows,
      workflowsCount,
      agents: rawSubagents,
      subagentsCount,
      workspaceTools: runtimeAgent?.workspaceTools || [],
      browserTools: runtimeAgent?.browserTools || [],
      defaultOptions: runtimeAgent?.defaultOptions || schema.defaultOptions || null,
      ownerId,
      organizationId: dbAgent?.organizationId ? String(dbAgent.organizationId) : null,
      owner: {
        name: ownerName,
        email: ownerEmail,
      },
      username: ownerName,
      isOwner,
      isInstalled,
      isPublished: Boolean(dbAgent?.isPublished),
      isPublishedToMarketplace: Boolean(dbAgent?.isPublished),
      publishedAt: dbAgent?.publishedAt || null,
      lastPublishedAt: dbAgent?.lastPublishedAt || null,
      installedBy: installedBy.map((r: any) => ({
        userId: String(r.userId),
        userName: r.userName || '',
        userEmail: r.userEmail || '',
        installedAt: r.installedAt,
      })),
      installedCount: installedBy.length,
      clonedFrom: dbAgent?.clonedFrom || null,
      source: dbAgent?.source || 'repository',
      createdAt: dbAgent?.createdAt || runtimeAgent?.createdAt || null,
      updatedAt: dbAgent?.updatedAt || runtimeAgent?.updatedAt || null,
    };
  }
}
