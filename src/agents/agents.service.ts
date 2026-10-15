import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

const MASTRA_BASE_URL = (process.env.MASTRA_BASE_URL || 'http://localhost:4111').replace(/\/+$/, '');

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  async create(createAgentDto: CreateAgentDto) {
    const { schema, ...data } = createAgentDto;
    const agent = await this.prisma.agent.create({
      data: { ...data, schema: schema ?? {} },
    });

    // Dual-write to Mastra dynamic runtime
    this.syncToMastraRuntime({
      id: agent.name || agent.id,
      name: agent.name,
      description: agent.description,
      instructions: (schema as any)?.instructions || (schema as any)?.systemPrompt,
      modelId: (schema as any)?.modelId,
      tools: (schema as any)?.tools,
    }).catch((err) => console.warn('[AgentsService] Mastra registration note:', err?.message));

    return agent;
  }

  async findAll() {
    return this.prisma.agent.findMany();
  }

  async findOne(id: string) {
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    let agent = null;
    if (isValidObjectId) {
      agent = await this.prisma.agent.findUnique({ where: { id } });
    }
    if (!agent) {
      agent = await this.prisma.agent.findFirst({
        where: {
          OR: [{ name: id }],
        },
      });
    }
    if (!agent) throw new NotFoundException(`Agent with ID ${id} not found`);
    return agent;
  }

  async findByMastraId(mastraId: string) {
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(mastraId);
    let agent = null;
    if (isValidObjectId) {
      agent = await this.prisma.agent.findUnique({ where: { id: mastraId } });
    }
    if (!agent) {
      agent = await this.prisma.agent.findFirst({
        where: {
          OR: [{ name: mastraId }],
        },
      });
    }

    if (!agent) {
      throw new NotFoundException(`Agent with mastraId ${mastraId} not found`);
    }

    return agent;
  }

  async update(id: string, updateAgentDto: UpdateAgentDto) {
    const { schema, ...data } = updateAgentDto;
    const updateData: any = { ...data };
    if (schema) updateData.schema = schema;

    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    let existing = null;
    if (isValidObjectId) {
      existing = await this.prisma.agent.findUnique({ where: { id } });
    }
    if (!existing) {
      existing = await this.prisma.agent.findFirst({
        where: {
          OR: [{ name: id }, { name: updateAgentDto.name || id }],
        },
      });
    }

    let agentRecord;
    if (existing) {
      agentRecord = await this.prisma.agent.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      // Upsert / create new agent record in Prisma
      agentRecord = await this.prisma.agent.create({
        data: {
          name: updateAgentDto.name || id,
          description: updateAgentDto.description || '',
          schema: schema ?? {},
          version: updateAgentDto.version || '1.0.0',
        },
      });
    }

    // Sync to Mastra runtime dynamically
    const runtimeId = id;
    const instructions =
      (schema as any)?.instructions ||
      (schema as any)?.systemPrompt ||
      (agentRecord.schema as any)?.instructions ||
      (agentRecord.schema as any)?.systemPrompt;
    const tools = (schema as any)?.tools || (agentRecord.schema as any)?.tools;
    const modelId = (schema as any)?.modelId || (agentRecord.schema as any)?.modelId;

    this.syncToMastraRuntime({
      id: runtimeId,
      name: agentRecord.name,
      description: agentRecord.description,
      instructions,
      modelId,
      tools: Array.isArray(tools) ? tools.map((t: any) => (typeof t === 'string' ? t : t.id || t.name)) : undefined,
    }).catch((err) => console.warn('[AgentsService] Mastra update sync note:', err?.message));

    return agentRecord;
  }

  async remove(id: string) {
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    let existing = null;
    if (isValidObjectId) {
      existing = await this.prisma.agent.findUnique({ where: { id } });
    }
    if (!existing) {
      existing = await this.prisma.agent.findFirst({ where: { name: id } });
    }

    if (existing) {
      await this.prisma.agent.delete({ where: { id: existing.id } });
    }

    // Unregister from Mastra runtime
    this.unregisterFromMastraRuntime(id).catch((err) =>
      console.warn('[AgentsService] Mastra unregister note:', err?.message)
    );

    return { success: true, message: `Agent ${id} removed` };
  }

  async publish(id: string, publishDto: any, userId?: string) {
    const agent = await this.findOne(id).catch(() => null);
    const agentName = agent?.name || id;
    const agentDesc = agent?.description || publishDto?.description || '';
    const price = publishDto?.price || publishDto?.priceCredits ? `$${publishDto.price || publishDto.priceCredits}` : 'Free';
    const category = publishDto?.category || 'General';

    // Upsert to marketplaceItem collection
    const marketplaceItem = await this.prisma.marketplaceItem.upsert({
      where: { itemId: id },
      create: {
        itemId: id,
        name: agentName,
        description: agentDesc,
        category,
        price,
        type: 'agent',
        isPublished: true,
        userId: userId || null,
        data: agent?.schema || publishDto?.schema || {},
      },
      update: {
        name: agentName,
        description: agentDesc,
        category,
        price,
        isPublished: true,
        data: agent?.schema || publishDto?.schema || {},
      },
    });

    return { success: true, marketplaceItem };
  }

  async unpublish(id: string) {
    const item = await this.prisma.marketplaceItem.findUnique({ where: { itemId: id } });
    if (item) {
      await this.prisma.marketplaceItem.update({
        where: { id: item.id },
        data: { isPublished: false },
      });
    }
    return { success: true, message: `Agent ${id} unpublished from marketplace` };
  }

  private async syncToMastraRuntime(payload: {
    id: string;
    name: string;
    description?: string | null;
    instructions?: string;
    modelId?: string;
    tools?: string[];
  }) {
    try {
      await fetch(`${MASTRA_BASE_URL}/internal/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      console.warn(`[AgentsService] Sync to Mastra runtime failed for ${payload.id}:`, err?.message);
    }
  }

  private async unregisterFromMastraRuntime(id: string) {
    try {
      await fetch(`${MASTRA_BASE_URL}/internal/agents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (err: any) {
      console.warn(`[AgentsService] Unregister from Mastra runtime failed for ${id}:`, err?.message);
    }
  }
}

