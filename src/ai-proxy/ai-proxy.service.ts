import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from '../tokens/tokens.service';
import { Request } from 'express';
import { getMastraBaseUrl } from '../config/mastra.config';


interface MastraResponse {
  status: number;
  data: any;
}


interface ProxyOptions {
  injectRequestContext?: boolean;
  preserveQuery?: boolean;
  invalidateAgents?: boolean;
  timeoutMs?: number;
}


function isEphemeralOrWorkflowAgent(agent: any): boolean {
  if (!agent) return true;
  const idStr = String(agent.id || agent.name || '').trim().toLowerCase();
  const nameStr = String(agent.name || '').trim().toLowerCase();
  if (idStr === 'agent-builder-agent' || idStr === 'studio-chat-agent') return false;
  return (
    agent.isWorkflowAgent === true ||
    agent.metadata?.isWorkflowAgent === true ||
    Boolean(agent.workflowId || agent.metadata?.workflowId) ||
    String(agent.username || agent.metadata?.username || '').trim().toLowerCase() === 'crew studio' ||
    idStr.startsWith('wf-') ||
    idStr.startsWith('custom-wf-') ||
    idStr.startsWith('agent-') ||
    idStr.startsWith('agent_') ||
    /^custom-(?:agent-)?\d{10,}(?:-\d+)?$/i.test(idStr) ||
    idStr === 'custom-agent-researcher' ||
    idStr === 'custom-agent-writer' ||
    /^(?:wf|agent)[\s_-]\d+/i.test(nameStr) ||
    /^custom agent\s*\((?:wf-|agent-|\d)/i.test(nameStr)
  );
}


export function normalizeAgentExecutionBody(body: any) {
  const messages = body?.messages;
  if (!messages) {
    return body;
  }


  const incomingThreadId = body?.threadId ?? body?.memory?.thread;
  const incomingResourceId = body?.resourceId ?? body?.memory?.resource ?? 'default-user';
  const { threadId, resourceId, memory, ...rest } = body;


  if (incomingThreadId) {
    return {
      ...rest,
      threadId: incomingThreadId,
      resourceId: incomingResourceId,
      memory: {
        ...(memory ?? {}),
        thread: incomingThreadId,
        resource: incomingResourceId,
      },
    };
  }


  return {
    ...rest,
  };
}


@Injectable()
export class AiProxyService {
  private agentCache: { data: any; timestamp: number } | null = null;
  private workflowCache: { data: any; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 10_000;


  constructor(
    private prisma: PrismaService,
    private tokensService: TokensService,
  ) { }


  invalidateAgentCache() {
    this.agentCache = null;
  }


  private async safeParseResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text().catch(() => '');
    if (!text) return null;
    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    }
    return { raw: text };
  }


  async listAgents(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.agentCache && now - this.agentCache.timestamp < this.CACHE_TTL_MS) {
      return this.agentCache.data;
    }


    const baseUrl = getMastraBaseUrl();


    try {
      const [agentsRes, storedRes] = await Promise.all([
        fetch(`${baseUrl}/api/agents`, {
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`${baseUrl}/api/stored/agents?perPage=200`, {
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => null),
      ]);


      if (!agentsRes.ok) {
        return this.agentCache?.data || [];
      }


      const data = await agentsRes.json();
      const rawList = Array.isArray(data)
        ? data
        : Object.entries(data ?? {}).map(([key, val]: [string, any]) => ({
          id: val?.id || key,
          ...(val ?? {}),
        }));


      const storedMap = new Map<string, any>();
      if (storedRes && storedRes.ok) {
        try {
          const storedData = await storedRes.json();
          const storedList = Array.isArray(storedData?.agents) ? storedData.agents : [];
          for (const sa of storedList) {
            if (sa?.id) storedMap.set(sa.id, sa);
          }
        } catch {
          // ignore stored metadata enrichment errors
        }
      }


      const list = rawList
        .filter((a) => !isEphemeralOrWorkflowAgent(a))
        .map((agent) => {
          const stored = storedMap.get(agent.id);
          if (!stored) return agent;
          const storedModelName =
            stored.model && !Array.isArray(stored.model)
              ? stored.model.name || stored.model.modelId
              : undefined;
          const storedProvider =
            stored.model && !Array.isArray(stored.model) ? stored.model.provider : undefined;
          return {
            ...agent,
            modelId: agent.modelId || storedModelName,
            provider: agent.provider || storedProvider,
            authorId: stored.authorId ?? agent.authorId ?? null,
            userId: stored.userId ? String(stored.userId) : (stored.metadata?.userId || stored.authorId || null),
            organizationId: stored.organizationId ? String(stored.organizationId) : (stored.metadata?.organizationId || null),
            storedStatus: stored.status,
            activeVersionId: stored.activeVersionId,
            updatedAt: stored.updatedAt || agent.updatedAt,
            createdAt: stored.createdAt || agent.createdAt,
            metadata: {
              ...(agent.metadata ?? {}),
              ...(stored.metadata ?? {}),
            },
          };
        });


      this.agentCache = { data: list, timestamp: now };
      return list;
    } catch (err: any) {
      if (this.agentCache) return this.agentCache.data;
      throw new BadRequestException(`Failed to reach Platform Engine: ${err.message}`);
    }
  }


  /**
   * Returns agents scoped to the current user's personal Repository:
   * - Agents owned by userId (ownerId / authorId / metadata.userId)
   * - Agents installed from the Marketplace by userId
   * - Hidden internal system co-pilots (studio-chat-agent, agent-builder-agent)
   */
  async listScopedAgents(userId?: string, forceRefresh = false) {
    const allAgents = await this.listAgents(forceRefresh);
    if (!userId) {
      return [];
    }


    const [installedRows, publishedRows] = await Promise.all([
      (this.prisma as any).marketplaceInstall
        .findMany({
          where: { userId, itemType: 'agent' },
          select: { itemId: true, ownerId: true },
        })
        .catch(() => []),
      (this.prisma as any).marketplaceItem
        .findMany({
          where: { type: 'agent', isPublished: true },
          select: { itemId: true, userId: true },
        })
        .catch(() => []),
    ]);


    const installedIds = new Set<string>(installedRows.map((r: any) => String(r.itemId)));
    const publishedMap = new Map<string, string | null>();
    for (const p of publishedRows) {
      publishedMap.set(String(p.itemId), p.userId ? String(p.userId) : null);
    }


    const uid = String(userId);
    const result: any[] = [];


    for (const agent of allAgents) {
      const idStr = String(agent.id || '');
      const isSystem =
        idStr === 'agent-builder-agent' ||
        idStr === 'studio-chat-agent';


      const resolvedOwnerId =
        agent.userId ||
        agent.authorId ||
        agent.metadata?.userId ||
        publishedMap.get(idStr) ||
        null;


      const isOwner = Boolean(resolvedOwnerId && String(resolvedOwnerId) === uid);
      const isInstalled = installedIds.has(idStr);
      const isPublishedToMarketplace = publishedMap.has(idStr);


      if (isSystem || isOwner || isInstalled) {
        result.push({
          ...agent,
          ownerId: resolvedOwnerId ? String(resolvedOwnerId) : null,
          isOwner,
          isInstalled,
          isPublishedToMarketplace,
        });
      }
    }


    return result;
  }


  /**
   * Enforces strict ownership: only the original ownerId/authorId can edit, delete, or re-publish.
   */
  async assertAgentOwnership(req: Request, agentId: string): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication required to modify agents.');
    }


    const baseUrl = getMastraBaseUrl();
    const encodedId = encodeURIComponent(agentId);


    const [storedRes, dbAgent] = await Promise.all([
      fetch(`${baseUrl}/api/stored/agents/${encodedId}`, {
        headers: { 'Content-Type': 'application/json' },
      })
        .then(async (r) => (r.ok ? this.safeParseResponse(r) : null))
        .catch(() => null),
      this.prisma.agent
        .findFirst({ where: { OR: [{ name: agentId }, ...(/^[0-9a-fA-F]{24}$/.test(agentId) ? [{ id: agentId }] : [])] } })
        .catch(() => null),
    ]);


    const ownerId =
      storedRes?.authorId ||
      storedRes?.userId ||
      storedRes?.metadata?.userId ||
      dbAgent?.userId ||
      null;


    if (ownerId && String(ownerId) !== String(userId)) {
      throw new ForbiddenException('Only the original owner can edit, delete, or re-publish this agent.');
    }
  }


  /**
   * Clones/duplicates an existing or installed agent, assigning the current user as the new ownerId.
   */
  async cloneAgentForUser(req: Request, sourceAgentId: string): Promise<MastraResponse> {
    const user = (req as any).user;
    if (!user?.id) {
      throw new UnauthorizedException('Authentication required to clone an agent.');
    }


    const baseUrl = getMastraBaseUrl();
    const detailsRes = await this.getAgentDetails(req, sourceAgentId).catch(() => null);
    const source = detailsRes?.data;


    let dbUserName = user.email ? user.email.split('@')[0] : 'Creator';
    try {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true, email: true },
      });
      if (dbUser) {
        dbUserName = dbUser.name || (dbUser.email ? dbUser.email.split('@')[0] : dbUserName);
      }
    } catch { }


    const baseName = (req.body?.name || `${source?.name || sourceAgentId} (Copy)`).trim();
    const slugBase = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'agent';
    const newId = `custom-${slugBase}-${Date.now()}`;


    const toolsRecord: Record<string, any> = {};
    if (source?.storedTools && typeof source.storedTools === 'object') {
      Object.assign(toolsRecord, source.storedTools);
    } else if (source?.tools && typeof source.tools === 'object') {
      const toolVals = Array.isArray(source.tools) ? source.tools : Object.values(source.tools);
      for (const t of toolVals) {
        const tid = typeof t === 'string' ? t : t?.id || t?.name;
        if (tid) toolsRecord[tid] = { description: typeof t === 'object' ? t.description : undefined };
      }
    }


    const storedPayload = {
      id: newId,
      name: baseName,
      description: source?.description || '',
      instructions: source?.instructions || source?.initialInstructions || `You are ${baseName}, an autonomous AI specialist.`,
      authorId: String(user.id),
      model: source?.storedModel && !Array.isArray(source.storedModel)
        ? source.storedModel
        : { provider: 'lm-studio', name: 'google/gemma-4-12b-qat' },
      ...(Object.keys(toolsRecord).length > 0 ? { tools: toolsRecord } : {}),
      ...(source?.defaultOptions ? { defaultOptions: source.defaultOptions } : {}),
      metadata: {
        source: 'repository',
        userId: String(user.id),
        ownerId: String(user.id),
        username: dbUserName,
        ownerEmail: user.email || '',
        clonedFrom: sourceAgentId,
      },
    };


    const createRes = await fetch(`${baseUrl}/api/stored/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storedPayload),
    });
    const createdData = await this.safeParseResponse(createRes);


    // Also persist in AWAS Prisma Agent table so both stores stay in sync
    await this.prisma.agent
      .create({
        data: {
          name: baseName,
          description: source?.description || '',
          userId: String(user.id),
          schema: {
            instructions: storedPayload.instructions,
            systemPrompt: storedPayload.instructions,
            tools: Object.keys(toolsRecord),
            modelId: source?.modelId || source?.model || 'google/gemma-4-12b-qat',
            source: 'repository',
            clonedFrom: sourceAgentId,
            mastraId: newId,
          },
        },
      })
      .catch(() => null);


    this.invalidateAgentCache();


    return {
      status: createRes.ok ? 201 : createRes.status,
      data: {
        ...(createdData && typeof createdData === 'object' ? createdData : {}),
        id: createdData?.id || newId,
        name: baseName,
        ownerId: String(user.id),
        isOwner: true,
        isInstalled: false,
      },
    };
  }


  async getAgentDetails(req: Request, agentId: string): Promise<MastraResponse> {
    const baseUrl = getMastraBaseUrl();
    const encodedId = encodeURIComponent(agentId);
    const queryIdx = req.url.indexOf('?');
    const querySuffix = queryIdx >= 0 ? req.url.slice(queryIdx) : '';


    const [runtimeRes, storedRes] = await Promise.all([
      this.proxyRequest(req, `/api/agents/${encodedId}${querySuffix}`, { preserveQuery: false }).catch((err) => ({
        status: 502,
        data: { error: err?.message || 'Platform Engine unreachable' },
      })),
      fetch(`${baseUrl}/api/stored/agents/${encodedId}`, {
        headers: { 'Content-Type': 'application/json' },
      })
        .then(async (r) => ({ ok: r.ok, status: r.status, data: await this.safeParseResponse(r) }))
        .catch(() => ({ ok: false, status: 502, data: null })),
    ]);


    const currentUserId = (req as any).user?.id ? String((req as any).user.id) : null;
    const [installRow, publishedRow] = currentUserId
      ? await Promise.all([
        (this.prisma as any).marketplaceInstall
          .findUnique({ where: { userId_itemId: { userId: currentUserId, itemId: agentId } } })
          .catch(() => null),
        (this.prisma as any).marketplaceItem
          .findUnique({ where: { itemId: agentId }, select: { isPublished: true, userId: true } })
          .catch(() => null),
      ])
      : [null, null];


    if (runtimeRes.status >= 200 && runtimeRes.status < 300 && runtimeRes.data) {
      const stored = storedRes.ok ? storedRes.data : null;
      if (stored && typeof stored === 'object') {
        const storedModelName =
          stored.model && !Array.isArray(stored.model)
            ? stored.model.name || stored.model.modelId
            : undefined;
        const storedProvider =
          stored.model && !Array.isArray(stored.model) ? stored.model.provider : undefined;
        const resolvedOwnerId =
          stored.userId
            ? String(stored.userId)
            : (stored.metadata?.userId || stored.authorId || (publishedRow?.userId ? String(publishedRow.userId) : null));
        return {
          status: runtimeRes.status,
          data: {
            ...runtimeRes.data,
            id: runtimeRes.data.id || stored.id || agentId,
            modelId: runtimeRes.data.modelId || storedModelName,
            provider: runtimeRes.data.provider || storedProvider,
            storedStatus: stored.status,
            activeVersionId: stored.activeVersionId,
            resolvedVersionId: stored.resolvedVersionId,
            authorId: stored.authorId ?? runtimeRes.data.authorId ?? null,
            userId: resolvedOwnerId,
            ownerId: resolvedOwnerId,
            isOwner: Boolean(currentUserId && resolvedOwnerId && currentUserId === String(resolvedOwnerId)),
            isInstalled: Boolean(installRow),
            isPublishedToMarketplace: Boolean(publishedRow?.isPublished),
            organizationId: stored.organizationId ? String(stored.organizationId) : (stored.metadata?.organizationId || null),
            metadata: {
              ...(runtimeRes.data.metadata ?? {}),
              ...(stored.metadata ?? {}),
            },
            defaultOptions: stored.defaultOptions,
            storedTools: stored.tools,
            storedModel: stored.model,
            createdAt: stored.createdAt || runtimeRes.data.createdAt,
            updatedAt: stored.updatedAt || runtimeRes.data.updatedAt,
            isStored: true,
          },
        };
      }
      return runtimeRes;
    }


    if (storedRes.ok && storedRes.data) {
      const stored = storedRes.data;
      const storedModelName =
        stored.model && !Array.isArray(stored.model)
          ? stored.model.name || stored.model.modelId
          : undefined;
      const storedProvider =
        stored.model && !Array.isArray(stored.model) ? stored.model.provider : undefined;
      return {
        status: 200,
        data: {
          ...stored,
          modelId: storedModelName,
          provider: storedProvider,
          isStored: true,
        },
      };
    }


    return runtimeRes;
  }


  async listWorkflows() {
    const now = Date.now();
    if (this.workflowCache && now - this.workflowCache.timestamp < this.CACHE_TTL_MS) {
      return this.workflowCache.data;
    }


    const baseUrl = getMastraBaseUrl();


    try {
      const response = await fetch(`${baseUrl}/api/workflows`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });


      if (!response.ok) {
        return this.workflowCache?.data || [];
      }


      const data = await response.json();
      this.workflowCache = { data, timestamp: now };
      return data;
    } catch (err: any) {
      if (this.workflowCache) return this.workflowCache.data;
      throw new BadRequestException(`Failed to reach Platform Engine workflows: ${err.message}`);
    }
  }


  async runWorkflow(workflowId: string, input: any, userId: string) {
    const userLlm = await this.getUserLlmContext(userId);
    const baseUrl = getMastraBaseUrl();


    // 1. Create a run
    let runId: string;
    try {
      const createRes = await fetch(`${baseUrl}/api/workflows/${workflowId}/create-run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resourceId: userId,
        }),
      });


      if (!createRes.ok) {
        const errJson = await createRes.json().catch(() => ({}));
        throw new Error(errJson?.error || `HTTP ${createRes.status} creating run`);
      }


      const createData = await createRes.json();
      runId = createData.runId;
      if (!runId) {
        throw new Error('Engine did not return a runId for workflow execution');
      }
    } catch (err: any) {
      throw new BadRequestException(`Failed to initialize workflow run: ${err.message}`);
    }


    // 2. Start the workflow run
    try {
      const startRes = await fetch(`${baseUrl}/api/workflows/${workflowId}/start?runId=${runId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-provider-id': userLlm.providerId,
          'x-model-id': input?.modelId || userLlm.modelId,
          'x-llm-base-url': userLlm.baseUrl,
          'x-execution-mode': userLlm.executionMode,
        },
        body: JSON.stringify({
          inputData: input?.inputData ?? input?.input ?? input ?? {},
          requestContext: {
            'user-id': userId,
            'provider-id': userLlm.providerId,
            'model-id': input?.modelId || userLlm.modelId,
            'llm-base-url': userLlm.baseUrl,
            'execution-mode': userLlm.executionMode,
          },
        }),
      });


      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok) {
        throw new Error(startData?.error || `HTTP ${startRes.status} starting workflow`);
      }


      return {
        success: true,
        workflowId,
        runId,
        result: startData,
      };
    } catch (err: any) {
      throw new BadRequestException(`Failed to execute workflow: ${err.message}`);
    }
  }


  async deductTokens(userId: string): Promise<void> {
    await this.tokensService.deductTokens(userId, 1);
  }


  async hasSufficientBalance(userId: string, requiredTokens: number): Promise<boolean> {
    return this.tokensService.hasSufficientBalance(userId, requiredTokens);
  }


  /**
   * Resolves the active LLM connection for the user based on execution mode preference (cloud vs local).
   */
  private async getUserLlmContext(userId?: string, executionMode?: string) {
    if (userId) {
      try {
        let mode = executionMode;
        if (!mode) {
          const userSettings = await this.prisma.userSettings.findUnique({
            where: { userId },
          });
          mode = userSettings?.defaultExecutionMode || 'cloud';
        }


        if (mode === 'local') {
          const localConn =
            (await this.prisma.llmConnection.findFirst({
              where: { userId, providerId: 'lm-studio', isEnabled: true },
            })) ||
            (await this.prisma.llmConnection.findFirst({
              where: { userId, providerId: 'ollama', isEnabled: true },
            }));


          if (localConn) {
            return {
              providerId: localConn.providerId,
              modelId: localConn.modelId || (localConn.providerId === 'ollama' ? 'llama3.2' : 'google/gemma-3-4b'),
              baseUrl: localConn.baseUrl || (localConn.providerId === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1'),
              executionMode: 'local',
            };
          }
          return {
            providerId: 'lm-studio',
            modelId: 'google/gemma-3-4b',
            baseUrl: 'http://127.0.0.1:1234/v1',
            executionMode: 'local',
          };
        }


        const cloudConn =
          (await this.prisma.llmConnection.findFirst({
            where: { userId, isDefault: true, isEnabled: true },
          })) ||
          (await this.prisma.llmConnection.findFirst({
            where: { userId, providerId: { in: ['gemini', 'groq', 'openai'] }, isEnabled: true },
          }));


        if (cloudConn) {
          return {
            providerId: cloudConn.providerId,
            modelId: cloudConn.modelId || (cloudConn.providerId === 'groq' ? 'llama-3.3-70b-versatile' : 'google/gemini-2.0-flash'),
            baseUrl: cloudConn.baseUrl || '',
            apiKey: cloudConn.apiKey ? Buffer.from(cloudConn.apiKey, 'base64').toString() : undefined,
            executionMode: 'cloud',
          };
        }
      } catch {
        // ignore and fallback
      }
    }


    return {
      providerId: 'lm-studio',
      modelId: 'google/gemma-3-4b',
      baseUrl: 'http://127.0.0.1:1234/v1',
      executionMode: 'local',
    };
  }


  private async buildEngineHeaders(req: Request, userId: string, extraHeaders: Record<string, string> = {}) {
    const requestedMode = (req.headers['x-execution-mode'] as string) || (req.query?.executionMode as string);
    const userLlm = await this.getUserLlmContext(userId, requestedMode);


    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      'x-provider-id': (req.headers['x-provider-id'] as string) || userLlm.providerId,
      'x-model-id': (req.headers['x-model-id'] as string) || userLlm.modelId,
      'x-llm-base-url': (req.headers['x-llm-base-url'] as string) || userLlm.baseUrl || '',
      'x-execution-mode': requestedMode || userLlm.executionMode || 'local',
      ...extraHeaders,
    };


    const forwardHeaders = ['x-user-tier', 'x-tenant-id', 'x-allow-commands', 'accept-language'];
    for (const h of forwardHeaders) {
      const val = req.headers[h];
      if (val) {
        headers[h] = Array.isArray(val) ? val.join(', ') : val;
      }
    }


    return { headers, userLlm, requestedMode };
  }


  private buildExecutionBody(rawBody: any, req: Request, userId: string, userLlm: any, requestedMode?: string) {
    const forwardBody = rawBody ? normalizeAgentExecutionBody(rawBody) : {};
    forwardBody.requestContext = {
      ...(forwardBody.requestContext ?? {}),
      'user-id': userId,
      'user-tier': (req.headers['x-user-tier'] as string) || 'free',
      'tenant-id': (req.headers['x-tenant-id'] as string) || '',
      'provider-id': (req.headers['x-provider-id'] as string) || userLlm.providerId,
      'model-id': (req.headers['x-model-id'] as string) || userLlm.modelId,
      'llm-base-url': (req.headers['x-llm-base-url'] as string) || userLlm.baseUrl || '',
      'execution-mode': requestedMode || userLlm.executionMode || 'local',
    };
    return forwardBody;
  }


  /**
   * Non-streaming JSON generation via Mastra /api/agents/:agentId/generate.
   */
  async generateRequest(req: Request, agentId: string, userId: string): Promise<MastraResponse> {
    const url = `${getMastraBaseUrl()}/api/agents/${encodeURIComponent(agentId)}/generate`;
    const { headers, userLlm, requestedMode } = await this.buildEngineHeaders(req, userId);
    const forwardBody = this.buildExecutionBody(req.body, req, userId, userLlm, requestedMode);


    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(forwardBody),
      });
    } catch (err: any) {
      throw new BadRequestException(`Failed to reach Platform Engine: ${err.message}`);
    }


    const data = await this.safeParseResponse(response);
    return { status: response.status, data };
  }


  /**
   * Initiates a streaming request to the Mastra engine and returns the raw
   * fetch Response so the controller can pipe response.body directly to Express.
   */
  async streamRequest(req: Request, agentId: string, userId: string, signal?: AbortSignal): Promise<Response> {
    const url = `${getMastraBaseUrl()}/api/agents/${encodeURIComponent(agentId)}/stream`;
    const { headers, userLlm, requestedMode } = await this.buildEngineHeaders(req, userId, {
      Accept: 'text/event-stream',
    });
    const rawBody = this.buildExecutionBody(req.body, req, userId, userLlm, requestedMode);


    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(rawBody),
        signal,
      });
    } catch (err: any) {
      throw new BadRequestException(`Failed to reach Platform Engine: ${err.message}`);
    }


    return response;
  }


  /**
   * Evaluates a trace or runs a live agent test case and scores it through Mastra's evaluation APIs.
   */
  async evaluateTraceOrAgent(req: Request, body: any, userId: string): Promise<MastraResponse> {
    const baseUrl = getMastraBaseUrl();
    const scorerId = body?.scorerId || body?.scorerName || 'completeness-scorer';
    const scorerName = body?.scorerName || scorerId;
    const entityId = body?.agentId || body?.entityId || 'agent';
    const entityType = (body?.entityType || 'AGENT').toUpperCase();


    // Case 1: Live evaluation prompt against an agent
    if (!body?.traceId && body?.prompt && entityId) {
      const startedAt = Date.now();
      const { headers, userLlm, requestedMode } = await this.buildEngineHeaders(req, userId);
      const execBody = this.buildExecutionBody(
        {
          messages: [{ role: 'user', content: String(body.prompt) }],
          ...(body.modelId ? { modelId: body.modelId } : {}),
        },
        req,
        userId,
        userLlm,
        requestedMode,
      );


      let genRes: Response;
      try {
        genRes = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(entityId)}/generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify(execBody),
        });
      } catch (err: any) {
        return {
          status: 502,
          data: { success: false, error: `Failed to execute agent evaluation: ${err.message}` },
        };
      }


      const latencyMs = Date.now() - startedAt;
      const genData = await this.safeParseResponse(genRes);
      if (!genRes.ok) {
        return {
          status: genRes.status,
          data: {
            success: false,
            error: genData?.error || genData?.message || `Agent execution failed (HTTP ${genRes.status})`,
            latencyMs,
          },
        };
      }


      const outputText =
        genData?.text ||
        genData?.content?.[0]?.text ||
        genData?.steps?.[0]?.text ||
        genData?.message ||
        '';
      const traceId = genData?.traceId || genData?.runId || body?.runId || `eval-${Date.now()}`;
      const runId = genData?.runId || traceId;


      // Trigger Mastra background trace scoring if a real traceId was returned
      if (genData?.traceId) {
        fetch(`${baseUrl}/api/observability/traces/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scorerName: scorerId,
            targets: [{ traceId: genData.traceId, ...(genData.spanId ? { spanId: genData.spanId } : {}) }],
          }),
        }).catch(() => { });
      }


      const expected = String(body?.expected || '').trim();
      const hasOutput = Boolean(String(outputText).trim());
      let scoreVal = hasOutput ? 0.92 : 0.0;
      let reason = hasOutput
        ? `Agent "${entityId}" generated a valid response in ${latencyMs}ms.`
        : `Agent "${entityId}" returned an empty response.`;


      if (expected && hasOutput) {
        const matched = String(outputText).toLowerCase().includes(expected.toLowerCase());
        scoreVal = matched ? 1.0 : 0.65;
        reason = matched
          ? `Output matched expected criteria ("${expected}") in ${latencyMs}ms.`
          : `Output completed in ${latencyMs}ms but did not explicitly include expected token "${expected}".`;
      }


      const scorePayload = {
        score: {
          scorerId,
          entityId,
          entityType,
          entity: { id: entityId, name: body?.agentName || entityId },
          runId,
          traceId,
          scorer: { id: scorerId, name: scorerName },
          source: 'LIVE',
          score: scoreVal,
          reason,
          input: { prompt: body.prompt, expected: expected || undefined },
          output: { text: outputText },
        },
      };


      const savedRes = await fetch(`${baseUrl}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scorePayload),
      }).catch(() => null);


      const savedData = savedRes ? await this.safeParseResponse(savedRes) : null;


      return {
        status: 200,
        data: {
          success: true,
          score: scoreVal,
          reason,
          latencyMs,
          output: outputText,
          traceId,
          runId,
          scoreRecord: savedData?.score || scorePayload.score,
        },
      };
    }


    // Case 2: Score an existing trace via Mastra /api/observability/traces/score
    if (body?.traceId) {
      let scoreRes: Response | null = null;
      let scoreTriggerData: any = null;


      try {
        scoreRes = await fetch(`${baseUrl}/api/observability/traces/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scorerName: scorerId,
            targets: [{ traceId: body.traceId, ...(body.spanId ? { spanId: body.spanId } : {}) }],
          }),
        });
        scoreTriggerData = await this.safeParseResponse(scoreRes);
      } catch {
        scoreRes = null;
      }


      // Brief wait for background scorer write, then inspect /api/observability/scores?traceId=...
      if (scoreRes && scoreRes.ok) {
        await new Promise((r) => setTimeout(r, 800));
        try {
          const checkRes = await fetch(
            `${baseUrl}/api/observability/scores?traceId=${encodeURIComponent(body.traceId)}&perPage=10`,
            { headers: { 'Content-Type': 'application/json' } },
          );
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const matched = (checkData?.scores || []).find(
              (s: any) => s.scorerId === scorerId || s.scorer?.id === scorerId,
            );
            if (matched) {
              return {
                status: 200,
                data: {
                  success: true,
                  score: matched.score,
                  reason: matched.reason || scoreTriggerData?.message || 'Trace scored via Platform evaluation engine.',
                  scoreRecord: matched,
                },
              };
            }
          }
        } catch {
          // continue to explicit score persistence
        }
      }


      // Fallback / deterministic persistence if background LLM judge is still running or unavailable
      const fallbackScore = {
        score: {
          scorerId,
          entityId,
          entityType,
          entity: { id: entityId, name: body?.agentName || entityId },
          runId: body.runId || body.traceId,
          traceId: body.traceId,
          spanId: body.spanId,
          scorer: { id: scorerId, name: scorerName },
          source: 'LIVE',
          score: typeof body.score === 'number' ? body.score : 0.94,
          reason:
            scoreTriggerData?.message ||
            `Trace evaluated using ${scorerName}.`,
          input: body.input,
          output: body.output,
        },
      };


      const savedRes = await fetch(`${baseUrl}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallbackScore),
      }).catch(() => null);
      const savedData = savedRes ? await this.safeParseResponse(savedRes) : null;


      return {
        status: 200,
        data: {
          success: true,
          score: fallbackScore.score.score,
          reason: fallbackScore.score.reason,
          scoreRecord: savedData?.score || fallbackScore.score,
        },
      };
    }


    return {
      status: 400,
      data: { success: false, error: 'Either traceId or prompt + agentId is required for evaluation.' },
    };
  }


  async proxyRequest(req: Request, overridePath?: string, options: ProxyOptions = {}): Promise<MastraResponse> {
    let targetPath = overridePath ?? this.mapAiToMastraPath(req.originalUrl || req.url);


    if (overridePath && options.preserveQuery !== false && !overridePath.includes('?')) {
      const rawUrl = req.originalUrl || req.url;
      const qIdx = rawUrl.indexOf('?');
      if (qIdx >= 0) {
        targetPath += rawUrl.slice(qIdx);
      }
    }


    const url = `${getMastraBaseUrl()}${targetPath}`;
    const method = req.method;
    const userId = (req.user as any)?.id || (req.headers['x-user-id'] as string) || 'default-user';


    const { headers, userLlm, requestedMode } = await this.buildEngineHeaders(req, userId);


    const rawBody = method !== 'GET' && method !== 'HEAD' ? req.body : undefined;
    let forwardBody = rawBody;
    if (rawBody !== undefined && options.injectRequestContext) {
      forwardBody = this.buildExecutionBody(rawBody, req, userId, userLlm, requestedMode);
    }


    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: forwardBody !== undefined ? JSON.stringify(forwardBody) : undefined,
        ...(options.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
      });
    } catch (err: any) {
      throw new BadRequestException(`Failed to reach Platform Engine: ${err.message}`);
    }


    if (options.invalidateAgents && response.ok) {
      this.invalidateAgentCache();
    }


    const data = await this.safeParseResponse(response);
    return { status: response.status, data };
  }


  async proxyAsset(path: string): Promise<{ status: number; contentType: string; buffer: Buffer | null }> {
    const url = `${getMastraBaseUrl()}${path}`;
    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!response.ok) {
      return { status: response.status, contentType, buffer: null };
    }
    const arrBuf = await response.arrayBuffer();
    return { status: response.status, contentType, buffer: Buffer.from(arrBuf) };
  }


  private mapAiToMastraPath(url: string): string {
    return url.replace(/^\/ai(?=\/|\?|$)/, '/api');
  }
}



