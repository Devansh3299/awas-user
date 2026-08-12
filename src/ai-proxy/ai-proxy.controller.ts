import { Controller, Get, Post, Param, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request, Response } from 'express';
import { Readable } from 'stream';

@Controller('ai')
export class AiProxyController {
  constructor(private readonly aiProxyService: AiProxyService) {}

  @UseGuards(JwtAuthGuard)
  @Get('agents')
  async listAgents(@Req() req: Request, @Res() res: Response) {
    const agents = await this.aiProxyService.listAgents();
    res.status(200).json(agents);
  }

  @UseGuards(JwtAuthGuard)
  @Get('studio-chat')
  async studioChat(@Req() req: Request, @Res() res: Response) {
    const agents = await this.aiProxyService.listAgents();
    res.status(200).json(agents);
  }

  @UseGuards(JwtAuthGuard)
  @Get('agents/:id')
  async getAgentById(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const mastraResponse = await this.aiProxyService.proxyRequest(req, `/api/agents/${agentId}`);
    res.status(mastraResponse.status).json(mastraResponse.data);
  }

  /**
   * POST /ai/agents/:id/generate
   *
   * Dual-mode endpoint:
   *  - If client sends `Accept: text/event-stream` → SSE streaming pipe from Mastra.
   *  - Otherwise → blocking JSON proxy (backward-compat fallback).
   */
  @UseGuards(JwtAuthGuard)
  @Post('agents/:id/generate')
  @HttpCode(HttpStatus.OK)
  async generate(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const hasBalance = await this.aiProxyService.hasSufficientBalance(userId, 1);
    if (!hasBalance) {
      res.status(402).json({ error: 'Insufficient token balance' });
      return;
    }

    // Always stream — call Mastra's /stream endpoint and pipe SSE directly
    const mastraResponse = await this.aiProxyService.streamRequest(req, agentId, userId);

    // Set SSE headers before anything else
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // If Mastra returned an error or no body, synthesise an SSE error event
    if (!mastraResponse.ok || !mastraResponse.body) {
      let errText = `Mastra error ${mastraResponse.status}`;
      try {
        const j = await mastraResponse.json();
        errText = j?.error || j?.message || errText;
      } catch {}
      res.write(`data: 3:${JSON.stringify(errText)}\n\n`);
      res.write(`data: d:{"finishReason":"error"}\n\n`);
      res.end();
      return;
    }

    const contentType = mastraResponse.headers.get('content-type') ?? '';

    if (contentType.includes('text/event-stream')) {
      // ── True streaming: pipe the SSE body from Mastra directly ──────────
      const nodeStream = Readable.fromWeb(mastraResponse.body as any);

      nodeStream.on('data', (chunk) => res.write(chunk));

      nodeStream.on('end', async () => {
        res.end();
        try { await this.aiProxyService.deductTokens(userId); } catch {}
      });

      nodeStream.on('error', (err) => {
        console.error('[AiProxy] stream error:', err.message);
        res.end();
      });

      req.on('close', () => nodeStream.destroy());

    } else {
      // ── JSON response from Mastra: synthesise SSE tokens from the text ──
      let json: any = {};
      try { json = await mastraResponse.json(); } catch {}

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
      try { await this.aiProxyService.deductTokens(userId); } catch {}
    }
  }


  @UseGuards(JwtAuthGuard)
  @Post('agents/:id/stream')
  @HttpCode(HttpStatus.OK)
  async stream(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req.user as any)?.id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const hasBalance = await this.aiProxyService.hasSufficientBalance(userId, 1);
    if (!hasBalance) {
      res.status(402).json({ error: 'Insufficient token balance' });
      return;
    }
    const mastraResponse = await this.aiProxyService.proxyRequest(req, `/api/agents/${agentId}/stream`);
    await this.aiProxyService.deductTokens(userId);
    res.status(mastraResponse.status).json(mastraResponse.data);
  }

  @UseGuards(JwtAuthGuard)
  @Get('memory/threads')
  async getThreads(@Req() req: Request, @Res() res: Response) {
    const mastraResponse = await this.aiProxyService.proxyRequest(req);
    res.status(mastraResponse.status).json(mastraResponse.data);
  }

  @UseGuards(JwtAuthGuard)
  @Get('memory/threads/:id/messages')
  async getMessages(
    @Param('id') threadId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const mastraResponse = await this.aiProxyService.proxyRequest(req, `/api/memory/threads/${threadId}/messages`);
    res.status(mastraResponse.status).json(mastraResponse.data);
  }

  @UseGuards(JwtAuthGuard)
  @Get('logs')
  async getLogs(@Req() req: Request, @Res() res: Response) {
    const transportId = (req.query as any).transportId ?? 'default';
    const mastraResponse = await this.aiProxyService.proxyRequest(req, `/api/logs?transportId=${transportId}`);
    res.status(mastraResponse.status).json(mastraResponse.data);
  }
}