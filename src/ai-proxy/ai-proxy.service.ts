import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from '../tokens/tokens.service';
import { Request } from 'express';

const MASTRA_BASE_URL = process.env.MASTRA_BASE_URL || 'http://localhost:4111';

interface MastraResponse {
  status: number;
  data: any;
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
  constructor(
    private prisma: PrismaService,
    private tokensService: TokensService,
  ) {}

  async listAgents() {
    try {
      const response = await fetch(`${MASTRA_BASE_URL}/api/agents`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return Array.isArray(data) ? data : Object.values(data ?? {});
    } catch (err) {
      throw new BadRequestException(`Failed to reach Mastra service: ${err.message}`);
    }
  }

  async deductTokens(userId: string): Promise<void> {
    await this.tokensService.deductTokens(userId, 1);
  }

  async hasSufficientBalance(userId: string, requiredTokens: number): Promise<boolean> {
    return this.tokensService.hasSufficientBalance(userId, requiredTokens);
  }

  /**
   * Resolves the active LLM connection for the user, defaulting to local LM Studio with google/gemma-3-4b.
   */
  private async getUserLlmContext(userId?: string) {
    if (userId) {
      try {
        const conn =
          (await this.prisma.llmConnection.findFirst({
            where: { userId, isDefault: true, isEnabled: true },
          })) ||
          (await this.prisma.llmConnection.findFirst({
            where: { userId, providerId: 'lm-studio', isEnabled: true },
          }));

        if (conn) {
          return {
            providerId: conn.providerId,
            modelId: conn.modelId || 'google/gemma-3-4b',
            baseUrl: conn.baseUrl || 'http://127.0.0.1:1234/v1',
            apiKey: conn.apiKey ? Buffer.from(conn.apiKey, 'base64').toString() : undefined,
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
    };
  }

  /**
   * Initiates a streaming request to the Mastra engine and returns the raw
   * fetch Response so the controller can pipe response.body directly to Express.
   */
  async streamRequest(req: Request, agentId: string, userId: string, signal?: AbortSignal): Promise<Response> {
    const url = `${MASTRA_BASE_URL}/api/agents/${agentId}/stream`;

    const userLlm = await this.getUserLlmContext(userId);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'x-user-id': userId,
      'x-provider-id': (req.headers['x-provider-id'] as string) || userLlm.providerId,
      'x-model-id': (req.headers['x-model-id'] as string) || userLlm.modelId,
      'x-llm-base-url': (req.headers['x-llm-base-url'] as string) || userLlm.baseUrl,
    };

    // Forward optional context headers
    const forwardHeaders = ['x-user-tier', 'x-tenant-id', 'x-execution-mode', 'x-allow-commands', 'accept-language'];
    for (const h of forwardHeaders) {
      const val = req.headers[h];
      if (val) {
        headers[h] = Array.isArray(val) ? val.join(', ') : val;
      }
    }

    const rawBody = req.body ? normalizeAgentExecutionBody(req.body) : {};

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(rawBody),
        signal,
      });
    } catch (err) {
      throw new BadRequestException(`Failed to reach Mastra service: ${err.message}`);
    }

    return response;
  }

  async proxyRequest(req: Request, overridePath?: string): Promise<MastraResponse> {
    const targetPath = overridePath ?? this.mapAiToMastraPath(req.url);
    const url = `${MASTRA_BASE_URL}${targetPath}`;
    const method = req.method;
    const userId = (req.user as any)?.id;

    const userLlm = await this.getUserLlmContext(userId);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-provider-id': (req.headers['x-provider-id'] as string) || userLlm.providerId,
      'x-model-id': (req.headers['x-model-id'] as string) || userLlm.modelId,
      'x-llm-base-url': (req.headers['x-llm-base-url'] as string) || userLlm.baseUrl,
    };

    const userHeaders = ['x-user-id', 'x-user-tier', 'x-tenant-id', 'x-allow-commands', 'accept-language'];
    for (const h of userHeaders) {
      const val = req.headers[h];
      if (val) {
        headers[h] = Array.isArray(val) ? val.join(', ') : val;
      }
    }

    const rawBody = method !== 'GET' && method !== 'HEAD' ? req.body : undefined;
    const forwardBody = rawBody ? normalizeAgentExecutionBody(rawBody) : undefined;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: forwardBody ? JSON.stringify(forwardBody) : undefined,
      });
    } catch (err) {
      throw new BadRequestException(`Failed to reach Mastra service: ${err.message}`);
    }

    const data = await response.json();
    return { status: response.status, data };
  }

  private mapAiToMastraPath(url: string): string {
    return url.replace(/^\/ai/, '/api');
  }
}