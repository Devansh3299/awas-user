import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from '../tokens/tokens.service';
import { Request } from 'express';

const MASTRA_BASE_URL = process.env.MASTRA_BASE_URL || 'http://localhost:4111';

interface MastraResponse {
  status: number;
  data: any;
}

@Injectable()
export class AiProxyService {
  constructor(
    private prisma: PrismaService,
    private tokensService: TokensService,
  ) {}

  async listAgents() {
    return this.prisma.agent.findMany();
  }

  async deductTokens(userId: string): Promise<void> {
    await this.tokensService.deductTokens(userId, 1);
  }

  async hasSufficientBalance(userId: string, requiredTokens: number): Promise<boolean> {
    return this.tokensService.hasSufficientBalance(userId, requiredTokens);
  }

  async proxyRequest(req: Request, overridePath?: string): Promise<MastraResponse> {
    const targetPath = overridePath ?? this.mapAiToMastraPath(req.url);
    const url = `${MASTRA_BASE_URL}${targetPath}`;
    const method = req.method;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const userHeaders = ['x-user-id', 'x-user-tier', 'x-tenant-id', 'x-allow-commands', 'accept-language'];
    for (const h of userHeaders) {
      const val = req.headers[h];
      if (val) {
        headers[h] = Array.isArray(val) ? val.join(', ') : val;
      }
    }

    const forwardBody = method !== 'GET' && method !== 'HEAD' ? req.body : undefined;

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