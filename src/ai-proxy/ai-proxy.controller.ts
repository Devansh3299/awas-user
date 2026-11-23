import { Controller, Get, Post, Param, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { Request, Response } from 'express';
import { Readable } from 'stream';

@Controller('ai')
export class AiProxyController {
  constructor(private readonly aiProxyService: AiProxyService) {}

  // Public — client dashboard & playground need runtime agent listings without forcing auth redirect
  @Get('agents')
  async listAgents(@Req() req: Request, @Res() res: Response) {
    const agents = await this.aiProxyService.listAgents();
    res.status(200).json(agents);
  }

  // Public studio chat agent roster
  @Get('studio-chat')
  async studioChat(@Req() req: Request, @Res() res: Response) {
    const agents = await this.aiProxyService.listAgents();
    res.status(200).json(agents);
  }

  // Public agent detail retriever for playground, editor & canvas
  @Get('agents/:id')
  async getAgentById(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.proxyRequest(req, `/api/agents/${agentId}`);
    res.status(engineResponse.status).json(engineResponse.data);
  }

  /**
   * POST /ai/agents/:id/generate
   * POST /ai/agents/:id/stream
   *
   * Real-time SSE streaming execution pipeline for agents.
   * Pipes Server-Sent Events directly from Core Engine to the client.
   * Supports both authenticated users and guest/sandbox testing.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Post('agents/:id/generate')
  @HttpCode(HttpStatus.OK)
  async generate(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleStreamExecution(agentId, req, res);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('agents/:id/stream')
  @HttpCode(HttpStatus.OK)
  async stream(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handleStreamExecution(agentId, req, res);
  }

  private async handleStreamExecution(agentId: string, req: Request, res: Response) {
    const userId = (req.user as any)?.id || (req.headers['x-user-id'] as string) || 'default-user';

    // Verify token balance if this is a registered user account
    if ((req.user as any)?.id) {
      const hasBalance = await this.aiProxyService.hasSufficientBalance(userId, 1).catch(() => true);
      if (!hasBalance) {
        res.status(402).json({ error: 'Insufficient token balance' });
        return;
      }
    }

    const abortController = new AbortController();
    let nodeStream: Readable | null = null;

    const cleanup = () => {
      abortController.abort();
      if (nodeStream && !nodeStream.destroyed) {
        nodeStream.destroy();
      }
    };
    req.once('close', cleanup);

    // Call Engine /stream endpoint and pipe SSE directly
    const engineResponse = await this.aiProxyService.streamRequest(req, agentId, userId, abortController.signal);

    // Set SSE headers before anything else
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // If Core Engine returned an error or no body, synthesise an SSE error event
    if (!engineResponse.ok || !engineResponse.body) {
      let errText = `Agent Runtime error ${engineResponse.status}`;
      try {
        const j = await engineResponse.json();
        errText = j?.error || j?.message || errText;
      } catch {}
      res.write(`data: 3:${JSON.stringify(errText)}\n\n`);
      res.write(`data: d:{"finishReason":"error"}\n\n`);
      res.end();
      return;
    }

    const contentType = engineResponse.headers.get('content-type') ?? '';

    if (contentType.includes('text/event-stream')) {
      // ── True streaming: pipe the SSE body directly ──────────
      nodeStream = Readable.fromWeb(engineResponse.body as any);

      nodeStream.on('data', (chunk) => res.write(chunk));

      nodeStream.on('end', async () => {
        res.end();
        if ((req.user as any)?.id) {
          try { await this.aiProxyService.deductTokens(userId); } catch {}
        }
      });

      nodeStream.on('error', (err) => {
        console.error('[AiProxy] stream error:', err.message);
        try {
          res.write(`data: 3:${JSON.stringify(err.message || 'Stream error')}\n\n`);
          res.write(`data: d:{"finishReason":"error"}\n\n`);
        } catch {}
        res.end();
      });

    } else {
      // ── JSON response: synthesise SSE tokens from the text ──
      let json: any = {};
      try { json = await engineResponse.json(); } catch {}

      const text: string =
        json?.text ||
        json?.content?.[0]?.text ||
        json?.steps?.[0]?.text ||
        json?.message ||
        '';

      const usage = json?.usage || json?.totalUsage || null;

      if (text) {
        // Emit in small word-sized chunks for a streaming feel
        const words = text.match(/\S+\s*/g) ?? [text];
        for (const word of words) {
          res.write(`data: 0:${JSON.stringify(word)}\n\n`);
        }
      }

      if (usage) {
        const usagePayload = {
          finishReason: json?.finishReason ?? 'stop',
          usage: {
            promptTokens: usage.inputTokens ?? usage.promptTokens ?? 0,
            completionTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
          },
        };
        res.write(`data: e:${JSON.stringify(usagePayload)}\n\n`);
      }

      res.write(`data: d:{"finishReason":"${json?.finishReason ?? 'stop'}"}\n\n`);
      res.end();
      if ((req.user as any)?.id) {
        try { await this.aiProxyService.deductTokens(userId); } catch {}
      }
    }
  }

  // Public workflow roster
  @Get('workflows')
  async listWorkflows(@Res() res: Response) {
    const workflows = await this.aiProxyService.listWorkflows();
    res.status(200).json(workflows);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('workflows/:id/run')
  async runWorkflow(
    @Param('id') workflowId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req.user as any)?.id || (req.headers['x-user-id'] as string) || 'default-user';

    if ((req.user as any)?.id) {
      const hasBalance = await this.aiProxyService.hasSufficientBalance(userId, 1).catch(() => true);
      if (!hasBalance) {
        res.status(402).json({ error: 'Insufficient token balance' });
        return;
      }
    }

    const result = await this.aiProxyService.runWorkflow(workflowId, req.body, userId);
    if ((req.user as any)?.id) {
      try {
        await this.aiProxyService.deductTokens(userId);
      } catch {}
    }

    res.status(200).json(result);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/threads')
  async getThreads(@Req() req: Request, @Res() res: Response) {
    const engineResponse = await this.aiProxyService.proxyRequest(req);
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/threads/:id/messages')
  async getMessages(
    @Param('id') threadId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.proxyRequest(req, `/api/memory/threads/${threadId}/messages`);
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('logs')
  async getLogs(@Req() req: Request, @Res() res: Response) {
    const transportId = (req.query as any).transportId ?? 'default';
    const engineResponse = await this.aiProxyService.proxyRequest(req, `/api/logs?transportId=${transportId}`);
    res.status(engineResponse.status).json(engineResponse.data);
  }
}