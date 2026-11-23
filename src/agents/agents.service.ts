import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentMetadataService } from './agent-metadata.service';
import { getMastraBaseUrl } from '../config/mastra.config';

function slugifyAgentId(name: string): string {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `custom-${base || 'agent'}-${Date.now()}`;
}

function resolveStoredModelSpec(modelId = 'google/gemma-4-12b-qat') {
  const raw = String(modelId || 'google/gemma-4-12b-qat').trim();
  if (raw === 'local-hardware' || raw.includes('gemma')) {
    return { provider: 'lm-studio', name: raw === 'local-hardware' ? 'google/gemma-4-12b-qat' : raw };
  }
  if (raw.startsWith('google/') || raw.startsWith('gemini')) {
    return { provider: 'google', name: raw.replace(/^google\//, '') };
  }
  if (raw.startsWith('llama') || raw.includes('gpt-oss')) {
    return { provider: 'groq', name: raw };
  }
  if (raw.startsWith('gpt-') || raw.startsWith('o1') || raw.startsWith('o3') || raw.startsWith('o4')) {
    return { provider: 'openai', name: raw };
  }
  if (raw.includes('/')) {
    const [prov, ...rest] = raw.split('/');
    return { provider: prov, name: rest.join('/') };
  }
  return { provider: 'openai', name: raw };
}

@Injectable()
export class AgentsService {
  constructor(private readonly metadata: AgentMetadataService) {}

  async create(createAgentDto: CreateAgentDto, userId: string) {
    const schema = (createAgentDto.schema ?? {}) as Record<string, any>;
    const mastraAgentId = createAgentDto.mastraId?.trim() || slugifyAgentId(createAgentDto.name);
    const instructions =
      schema.instructions ||
      schema.systemPrompt ||
      `You are ${createAgentDto.name}, an autonomous AI specialist.`;
    const modelId = schema.modelId || schema.model || 'google/gemma-4-12b-qat';
    const rawTools = Array.isArray(schema.tools) ? schema.tools : [];
    const toolIds = rawTools
      .map((t: any) => (typeof t === 'string' ? t : t?.id || t?.name))
      .filter(Boolean);
    const toolsRecord: Record<string, any> = {};
    for (const t of rawTools) {
      const tid = typeof t === 'string' ? t : t?.id || t?.name;
      if (tid) toolsRecord[tid] = { description: typeof t === 'object' ? t?.description : undefined };
    }

    const identity = await this.metadata.resolveUserIdentity(userId);

    // 1. Persist in Mastra stored agents & dynamic runtime
    await this.createInMastra({
      id: mastraAgentId,
      name: createAgentDto.name,
      description: createAgentDto.description || '',
      instructions,
      modelId,
      tools: toolIds,
      toolsRecord,
      authorId: identity.ownerId,
      metadata: {
        source: schema.source || 'repository',
        userId: identity.ownerId,
        ownerId: identity.ownerId,
        organizationId: identity.organizationId,
        username: identity.owner.name,
        ownerEmail: identity.owner.email,
      },
    });

    // 2. Persist authoritative metadata record in AWAS MongoDB
    const priceStr =
      typeof createAgentDto.price === 'number' && createAgentDto.price > 0
        ? `$${createAgentDto.price}`
        : 'Free';

    const saved = await this.metadata.upsertAgentMetadata(mastraAgentId, userId, {
      name: createAgentDto.name,
      description: createAgentDto.description || '',
      category: schema.type || 'Custom Agent',
      price: priceStr,
      version: createAgentDto.version || '1.0.0',
      schema: {
        ...schema,
        instructions,
        systemPrompt: instructions,
        modelId,
        tools: toolIds,
        source: schema.source || 'repository',
      },
      source: schema.source || 'repository',
    });

    return this.metadata.formatAgentView(saved, null, userId);
  }

  async findAll(userId?: string) {
    if (!userId) return [];
    const records = await this.metadata.listUserAccessibleAgents(userId);
    return records.map((r) => this.metadata.formatAgentView(r, null, userId));
  }

  async findOne(id: string, userId?: string) {
    const { record } = await this.metadata.assertAccess(id, userId);
    if (!record) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }
    return this.metadata.formatAgentView(record, null, userId);
  }

  async findByMastraId(mastraId: string, userId?: string) {
    return this.findOne(mastraId, userId);
  }

  async update(id: string, updateAgentDto: UpdateAgentDto, userId: string) {
    const existing = await this.metadata.assertOwnership(id, userId, true);
    if (!existing) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }

    const schema = (updateAgentDto.schema ?? {}) as Record<string, any>;
    const mergedSchema = {
      ...((existing.schema as Record<string, any>) ?? {}),
      ...schema,
    };

    const updated = await this.metadata.upsertAgentMetadata(existing.mastraAgentId, userId, {
      name: updateAgentDto.name || existing.name,
      description:
        updateAgentDto.description !== undefined ? updateAgentDto.description : existing.description,
      version: updateAgentDto.version || existing.version,
      price:
        typeof updateAgentDto.price === 'number'
          ? updateAgentDto.price > 0
            ? `$${updateAgentDto.price}`
            : 'Free'
          : undefined,
      schema: mergedSchema,
    });

    const instructions = mergedSchema.instructions || mergedSchema.systemPrompt;
    const modelId = mergedSchema.modelId || mergedSchema.model;
    const rawTools = Array.isArray(mergedSchema.tools) ? mergedSchema.tools : undefined;
    const toolIds = rawTools?.map((t: any) => (typeof t === 'string' ? t : t?.id || t?.name)).filter(Boolean);

    await this.updateInMastra(existing.mastraAgentId, {
      name: updated.name,
      description: updated.description || '',
      instructions,
      modelId,
      tools: toolIds,
    });

    return this.metadata.formatAgentView(updated, null, userId);
  }

  async remove(id: string, userId: string) {
    const deleted = await this.metadata.deleteAgentMetadata(id, userId);
    const targetMastraId = deleted?.mastraAgentId || id;
    await this.deleteFromMastra(targetMastraId);
    return { success: true, mastraAgentId: targetMastraId, message: `Agent ${targetMastraId} removed` };
  }

  async publish(id: string, publishDto: any, userId: string) {
    const rawPrice = publishDto?.price ?? publishDto?.priceCredits;
    const price =
      rawPrice === undefined || rawPrice === null || rawPrice === '' || String(rawPrice).toLowerCase() === 'free' || rawPrice === 0
        ? 'Free'
        : String(rawPrice).startsWith('$')
          ? String(rawPrice)
          : `$${rawPrice}`;

    const updated = await this.metadata.publishAgent(id, userId, {
      name: publishDto?.name,
      description: publishDto?.description,
      category: publishDto?.category,
      price,
      tags: Array.isArray(publishDto?.tags) ? publishDto.tags : undefined,
      schema: publishDto?.schema || publishDto?.data,
      isPublished: publishDto?.isPublished !== false,
    });

    return {
      success: true,
      agent: this.metadata.formatAgentView(updated, null, userId),
    };
  }

  async unpublish(id: string, userId: string) {
    const updated = await this.metadata.unpublishAgent(id, userId);
    return {
      success: true,
      agent: this.metadata.formatAgentView(updated, null, userId),
      message: `Agent ${updated.mastraAgentId} unpublished from marketplace`,
    };
  }

  async install(id: string, userId: string) {
    const res = await this.metadata.installAgent(id, userId);
    return {
      success: true,
      alreadyInstalled: res.alreadyInstalled,
      agent: this.metadata.formatAgentView(res.agent, null, userId),
    };
  }

  async uninstall(id: string, userId: string) {
    return this.metadata.uninstallAgent(id, userId);
  }

  private async createInMastra(payload: {
    id: string;
    name: string;
    description: string;
    instructions: string;
    modelId: string;
    tools: string[];
    toolsRecord: Record<string, any>;
    authorId: string;
    metadata: Record<string, any>;
  }) {
    const baseUrl = getMastraBaseUrl();
    await Promise.allSettled([
      fetch(`${baseUrl}/api/stored/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payload.id,
          name: payload.name,
          description: payload.description,
          instructions: payload.instructions,
          authorId: payload.authorId,
          model: resolveStoredModelSpec(payload.modelId),
          ...(Object.keys(payload.toolsRecord).length > 0 ? { tools: payload.toolsRecord } : {}),
          metadata: payload.metadata,
        }),
      }),
      fetch(`${baseUrl}/internal/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payload.id,
          name: payload.name,
          description: payload.description,
          instructions: payload.instructions,
          modelId: payload.modelId,
          tools: payload.tools,
        }),
      }),
    ]);
  }

  private async updateInMastra(
    mastraAgentId: string,
    payload: {
      name?: string;
      description?: string;
      instructions?: string;
      modelId?: string;
      tools?: string[];
    },
  ) {
    const baseUrl = getMastraBaseUrl();
    const storedPatch: Record<string, any> = {};
    if (payload.name) storedPatch.name = payload.name;
    if (payload.description !== undefined) storedPatch.description = payload.description;
    if (payload.instructions !== undefined) storedPatch.instructions = payload.instructions;
    if (payload.modelId) storedPatch.model = resolveStoredModelSpec(payload.modelId);
    if (payload.tools) {
      const rec: Record<string, any> = {};
      for (const tid of payload.tools) rec[tid] = {};
      storedPatch.tools = rec;
    }

    await Promise.allSettled([
      fetch(`${baseUrl}/api/stored/agents/${encodeURIComponent(mastraAgentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storedPatch),
      }),
      fetch(`${baseUrl}/internal/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mastraAgentId,
          name: payload.name,
          description: payload.description,
          instructions: payload.instructions,
          modelId: payload.modelId,
          tools: payload.tools,
        }),
      }),
    ]);
  }

  private async deleteFromMastra(mastraAgentId: string) {
    const baseUrl = getMastraBaseUrl();
    await Promise.allSettled([
      fetch(`${baseUrl}/api/stored/agents/${encodeURIComponent(mastraAgentId)}`, {
        method: 'DELETE',
      }),
      fetch(`${baseUrl}/internal/agents/${encodeURIComponent(mastraAgentId)}`, {
        method: 'DELETE',
      }),
    ]);
  }
}
