import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request, Response } from 'express';
import { Readable } from 'stream';

@Controller('ai')
export class AiProxyController {
  constructor(private readonly aiProxyService: AiProxyService) {}

  // ── Agents Runtime ──────────────────────────────────────────────────────────

  @UseGuards(OptionalJwtAuthGuard)
  @Get('agents')
  async listAgents(@Req() req: Request, @Res() res: Response) {
    const forceRefresh = req.query?.refresh === 'true' || req.query?.refresh === '1';
    const userId = (req.user as any)?.id;
    const agents = await this.aiProxyService.listScopedAgents(userId, forceRefresh);
    res.status(200).json(agents);
  }

  @Get('studio-chat')
  async studioChat(@Res() res: Response) {
    const agents = await this.aiProxyService.listAgents();
    res.status(200).json(agents);
  }

  @Get('agents/providers')
  async getAgentProviders(@Req() req: Request, @Res() res: Response) {
    const engineResponse = await this.aiProxyService.proxyRequest(req, '/api/agents/providers');
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('agents/:id')
  async getAgentById(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.getAgentDetails(req, agentId);
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(JwtAuthGuard)
  @Post('agents/:id/clone')
  async cloneAgent(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.cloneAgentForUser(req, agentId);
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(JwtAuthGuard)
  @Post('agents/:id/model')
  async updateAgentModel(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.aiProxyService.assertAgentOwnership(req, agentId);
    const engineResponse = await this.aiProxyService.proxyRequest(
      req,
      `/api/agents/${encodeURIComponent(agentId)}/model`,
      { invalidateAgents: true },
    );
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(JwtAuthGuard)
  @Post('agents/:id/model/reset')
  async resetAgentModel(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.aiProxyService.assertAgentOwnership(req, agentId);
    const engineResponse = await this.aiProxyService.proxyRequest(
      req,
      `/api/agents/${encodeURIComponent(agentId)}/model/reset`,
      { invalidateAgents: true },
    );
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('agents/:id/instructions/enhance')
  async enhanceAgentInstructions(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.proxyRequest(
      req,
      `/api/agents/${encodeURIComponent(agentId)}/instructions/enhance`,
    );
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('agents/:id/runs/:runId/abort')
  async abortAgentRun(
    @Param('id') agentId: string,
    @Param('runId') runId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.proxyRequest(
      req,
      `/api/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/abort`,
    );
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('agents/:id/suspended-runs')
  async getSuspendedRuns(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.proxyRequest(
      req,
      `/api/agents/${encodeURIComponent(agentId)}/suspended-runs`,
    );
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('agents/:id/tools/:toolId/execute')
  async executeAgentTool(
    @Param('id') agentId: string,
    @Param('toolId') toolId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.proxyRequest(
      req,
      `/api/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolId)}/execute`,
      { injectRequestContext: true },
    );
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('agents/:id/approve-tool-call')
  async approveToolCall(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.proxyRequest(
      req,
      `/api/agents/${encodeURIComponent(agentId)}/approve-tool-call`,
    );
    res.status(engineResponse.status).json(engineResponse.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('agents/:id/decline-tool-call')
  async declineToolCall(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const engineResponse = await this.aiProxyService.proxyRequest(
      req,
      `/api/agents/${encodeURIComponent(agentId)}/decline-tool-call`,
    );
    res.status(engineResponse.status).json(engineResponse.data);
  }

  /**
   * POST /ai/agents/:id/generate
   * Returns JSON by default (matching Mastra /generate) or SSE stream when Accept: text/event-stream is requested.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Post('agents/:id/generate')
  @HttpCode(HttpStatus.OK)
  async generate(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const acceptHeader = String(req.headers.accept || '');
    if (acceptHeader.includes('text/event-stream')) {
      return this.handleStreamExecution(agentId, req, res);
    }

    const userId = (req.user as any)?.id || (req.headers['x-user-id'] as string) || 'default-user';
    if ((req.user as any)?.id) {
      const hasBalance = await this.aiProxyService.hasSufficientBalance(userId, 1).catch(() => true);
      if (!hasBalance) {
        res.status(402).json({ error: 'Insufficient token balance' });
        return;
      }
    }

    const engineResponse = await this.aiProxyService.generateRequest(req, agentId, userId);
    if ((req.user as any)?.id && engineResponse.status >= 200 && engineResponse.status < 300) {
      try {
        await this.aiProxyService.deductTokens(userId);
      } catch {}
    }
    res.status(engineResponse.status).json(engineResponse.data);
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

    const engineResponse = await this.aiProxyService.streamRequest(req, agentId, userId, abortController.signal);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

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

  // ── Stored Agents & Versions (Editor APIs) ──────────────────────────────────

  @Get('stored/agents')
  async listStoredAgents(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/stored/agents');
    res.status(r.status).json(r.data);
  }

  @UseGuards(JwtAuthGuard)
  @Post('stored/agents')
  async createStoredAgent(@Req() req: Request, @Res() res: Response) {
    const userId = String((req.user as any)?.id || '');
    if (req.body && typeof req.body === 'object') {
      req.body.authorId = userId;
      req.body.metadata = {
        ...(req.body.metadata ?? {}),
        userId,
        ownerId: userId,
      };
    }
    const r = await this.aiProxyService.proxyRequest(req, '/api/stored/agents', { invalidateAgents: true });
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('stored/agents/preview-instructions')
  async previewStoredAgentInstructions(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/stored/agents/preview-instructions');
    res.status(r.status).json(r.data);
  }

  @Get('stored/agents/:storedAgentId')
  async getStoredAgent(@Param('storedAgentId') id: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/stored/agents/${encodeURIComponent(id)}`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('stored/agents/:storedAgentId')
  async updateStoredAgent(@Param('storedAgentId') id: string, @Req() req: Request, @Res() res: Response) {
    await this.aiProxyService.assertAgentOwnership(req, id);
    const r = await this.aiProxyService.proxyRequest(req, `/api/stored/agents/${encodeURIComponent(id)}`, {
      invalidateAgents: true,
    });
    res.status(r.status).json(r.data);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('stored/agents/:storedAgentId')
  async deleteStoredAgent(@Param('storedAgentId') id: string, @Req() req: Request, @Res() res: Response) {
    await this.aiProxyService.assertAgentOwnership(req, id);
    const r = await this.aiProxyService.proxyRequest(req, `/api/stored/agents/${encodeURIComponent(id)}`, {
      invalidateAgents: true,
    });
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('stored/agents/:storedAgentId/export')
  async exportStoredAgent(@Param('storedAgentId') id: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/stored/agents/${encodeURIComponent(id)}/export`);
    res.status(r.status).json(r.data);
  }

  @Get('stored/agents/:agentId/versions')
  async listAgentVersions(@Param('agentId') agentId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/stored/agents/${encodeURIComponent(agentId)}/versions`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(JwtAuthGuard)
  @Post('stored/agents/:agentId/versions')
  async createAgentVersion(@Param('agentId') agentId: string, @Req() req: Request, @Res() res: Response) {
    await this.aiProxyService.assertAgentOwnership(req, agentId);
    const r = await this.aiProxyService.proxyRequest(req, `/api/stored/agents/${encodeURIComponent(agentId)}/versions`, {
      invalidateAgents: true,
    });
    res.status(r.status).json(r.data);
  }

  @Get('stored/agents/:agentId/versions/compare')
  async compareAgentVersions(@Param('agentId') agentId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/stored/agents/${encodeURIComponent(agentId)}/versions/compare`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('stored/agents/:agentId/versions/:versionId')
  async getAgentVersion(
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/stored/agents/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(versionId)}`,
    );
    res.status(r.status).json(r.data);
  }

  @UseGuards(JwtAuthGuard)
  @Post('stored/agents/:agentId/versions/:versionId/activate')
  async activateAgentVersion(
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.aiProxyService.assertAgentOwnership(req, agentId);
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/stored/agents/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(versionId)}/activate`,
      { invalidateAgents: true },
    );
    res.status(r.status).json(r.data);
  }

  @UseGuards(JwtAuthGuard)
  @Post('stored/agents/:agentId/versions/:versionId/restore')
  async restoreAgentVersion(
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.aiProxyService.assertAgentOwnership(req, agentId);
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/stored/agents/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(versionId)}/restore`,
      { invalidateAgents: true },
    );
    res.status(r.status).json(r.data);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('stored/agents/:agentId/versions/:versionId')
  async deleteAgentVersion(
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.aiProxyService.assertAgentOwnership(req, agentId);
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/stored/agents/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(versionId)}`,
      { invalidateAgents: true },
    );
    res.status(r.status).json(r.data);
  }

  // ── Workflows ───────────────────────────────────────────────────────────────

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

  // ── Memory & Threads ────────────────────────────────────────────────────────

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/status')
  async getMemoryStatus(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/memory/status');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/config')
  async getMemoryConfig(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/memory/config');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/observational-memory')
  async getObservationalMemory(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/memory/observational-memory');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/search')
  async searchMemory(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/memory/search');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/threads')
  async getThreads(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/memory/threads');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('memory/threads')
  async createThread(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/memory/threads');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/threads/:id')
  async getThreadById(@Param('id') threadId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/memory/threads/${encodeURIComponent(threadId)}`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Patch('memory/threads/:id')
  async updateThread(@Param('id') threadId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/memory/threads/${encodeURIComponent(threadId)}`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Delete('memory/threads/:id')
  async deleteThread(@Param('id') threadId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/memory/threads/${encodeURIComponent(threadId)}`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/threads/:id/messages')
  async getMessages(
    @Param('id') threadId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/memory/threads/${encodeURIComponent(threadId)}/messages`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('memory/threads/:id/clone')
  async cloneThread(@Param('id') threadId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/memory/threads/${encodeURIComponent(threadId)}/clone`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('memory/threads/:id/working-memory')
  async getWorkingMemory(@Param('id') threadId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/memory/threads/${encodeURIComponent(threadId)}/working-memory`,
    );
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('memory/threads/:id/working-memory')
  async updateWorkingMemory(@Param('id') threadId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/memory/threads/${encodeURIComponent(threadId)}/working-memory`,
    );
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('memory/save-messages')
  async saveMessages(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/memory/save-messages');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('memory/messages/delete')
  async deleteMessages(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/memory/messages/delete');
    res.status(r.status).json(r.data);
  }

  // ── Scores & Evaluation ─────────────────────────────────────────────────────

  @Get('scores/scorers')
  async listScorers(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/scores/scorers');
    res.status(r.status).json(r.data);
  }

  @Get('scores/scorers/:scorerId')
  async getScorer(@Param('scorerId') scorerId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/scores/scorers/${encodeURIComponent(scorerId)}`);
    res.status(r.status).json(r.data);
  }

  @Get('scores/run/:runId')
  async listScoresByRun(@Param('runId') runId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/scores/run/${encodeURIComponent(runId)}`);
    res.status(r.status).json(r.data);
  }

  @Get('scores/scorer/:scorerId')
  async listScoresByScorer(@Param('scorerId') scorerId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/scores/scorer/${encodeURIComponent(scorerId)}`);
    res.status(r.status).json(r.data);
  }

  @Get('scores/entity/:entityType/:entityId')
  async listScoresByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/scores/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    );
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('scores')
  async saveScore(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/scores');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  async evaluate(@Req() req: Request, @Res() res: Response) {
    const userId = (req.user as any)?.id || (req.headers['x-user-id'] as string) || 'default-user';
    const result = await this.aiProxyService.evaluateTraceOrAgent(req, req.body, userId);
    res.status(result.status).json(result.data);
  }

  // ── Datasets & Experiments ──────────────────────────────────────────────────

  @Get('datasets')
  async listDatasets(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/datasets');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('datasets')
  async createDataset(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/datasets');
    res.status(r.status).json(r.data);
  }

  @Get('datasets/:datasetId')
  async getDataset(@Param('datasetId') datasetId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/datasets/${encodeURIComponent(datasetId)}`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Patch('datasets/:datasetId')
  async updateDataset(@Param('datasetId') datasetId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/datasets/${encodeURIComponent(datasetId)}`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Delete('datasets/:datasetId')
  async deleteDataset(@Param('datasetId') datasetId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/datasets/${encodeURIComponent(datasetId)}`);
    res.status(r.status).json(r.data);
  }

  @Get('datasets/:datasetId/items')
  async listDatasetItems(@Param('datasetId') datasetId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/datasets/${encodeURIComponent(datasetId)}/items`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('datasets/:datasetId/items')
  async createDatasetItem(@Param('datasetId') datasetId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/datasets/${encodeURIComponent(datasetId)}/items`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Delete('datasets/:datasetId/items/:itemId')
  async deleteDatasetItem(
    @Param('datasetId') datasetId: string,
    @Param('itemId') itemId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/datasets/${encodeURIComponent(datasetId)}/items/${encodeURIComponent(itemId)}`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('datasets/:datasetId/experiments')
  async listDatasetExperiments(@Param('datasetId') datasetId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/datasets/${encodeURIComponent(datasetId)}/experiments`,
    );
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('datasets/:datasetId/experiments')
  async createDatasetExperiment(@Param('datasetId') datasetId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/datasets/${encodeURIComponent(datasetId)}/experiments`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('datasets/:datasetId/experiments/:experimentId/results')
  async getDatasetExperimentResults(
    @Param('datasetId') datasetId: string,
    @Param('experimentId') experimentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/datasets/${encodeURIComponent(datasetId)}/experiments/${encodeURIComponent(experimentId)}/results`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('experiments')
  async listExperiments(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/experiments');
    res.status(r.status).json(r.data);
  }

  @Get('experiments/review-summary')
  async getExperimentsReviewSummary(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/experiments/review-summary');
    res.status(r.status).json(r.data);
  }

  @Get('experiments/:experimentId')
  async getExperiment(@Param('experimentId') experimentId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/experiments/${encodeURIComponent(experimentId)}`);
    res.status(r.status).json(r.data);
  }

  // ── Observability: Traces, Spans, Scores, Feedback, Metrics, Logs ───────────

  @Get('observability/traces')
  async listTraces(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/traces');
    res.status(r.status).json(r.data);
  }

  @Get('observability/traces/light')
  async listTracesLight(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/traces/light');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('observability/traces/query')
  async queryTraces(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/traces/query');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('observability/spans/query')
  async querySpans(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/spans/query');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('observability/traces/score')
  async scoreTraces(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/traces/score');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('observability/traces/delete')
  async deleteTraces(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/traces/delete');
    res.status(r.status).json(r.data);
  }

  @Get('observability/traces/:traceId')
  async getTrace(@Param('traceId') traceId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/observability/traces/${encodeURIComponent(traceId)}`);
    res.status(r.status).json(r.data);
  }

  @Get('observability/traces/:traceId/light')
  async getTraceLight(@Param('traceId') traceId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/observability/traces/${encodeURIComponent(traceId)}/light`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('observability/traces/:traceId/trajectory')
  async getTraceTrajectory(@Param('traceId') traceId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/observability/traces/${encodeURIComponent(traceId)}/trajectory`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('observability/traces/:traceId/spans/:spanId')
  async getSpan(
    @Param('traceId') traceId: string,
    @Param('spanId') spanId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/observability/traces/${encodeURIComponent(traceId)}/spans/${encodeURIComponent(spanId)}`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('observability/traces/:traceId/:spanId/scores')
  async getSpanScores(
    @Param('traceId') traceId: string,
    @Param('spanId') spanId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/observability/traces/${encodeURIComponent(traceId)}/${encodeURIComponent(spanId)}/scores`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('observability/scores')
  async listObservabilityScores(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/scores');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('observability/scores')
  async createObservabilityScore(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/scores');
    res.status(r.status).json(r.data);
  }

  @Get('observability/feedback')
  async listFeedback(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/feedback');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('observability/feedback')
  async createFeedback(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/feedback');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Patch('observability/feedback/:feedbackId/review-status')
  async updateFeedbackReviewStatus(
    @Param('feedbackId') feedbackId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const r = await this.aiProxyService.proxyRequest(
      req,
      `/api/observability/feedback/${encodeURIComponent(feedbackId)}/review-status`,
    );
    res.status(r.status).json(r.data);
  }

  @Get('observability/metrics')
  async listObservabilityMetrics(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/metrics');
    res.status(r.status).json(r.data);
  }

  @Get('observability/logs')
  async listObservabilityLogs(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/logs');
    res.status(r.status).json(r.data);
  }

  @Get('observability/capabilities')
  async getObservabilityCapabilities(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/observability/capabilities');
    res.status(r.status).json(r.data);
  }

  // ── Logs ────────────────────────────────────────────────────────────────────

  @UseGuards(OptionalJwtAuthGuard)
  @Get('logs/transports')
  async getLogTransports(@Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, '/api/logs/transports');
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('logs')
  async getLogs(@Req() req: Request, @Res() res: Response) {
    const transportId = (req.query as any).transportId ?? 'default';
    const r = await this.aiProxyService.proxyRequest(req, `/api/logs?transportId=${encodeURIComponent(transportId)}`);
    res.status(r.status).json(r.data);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('logs/:runId')
  async getLogsByRunId(@Param('runId') runId: string, @Req() req: Request, @Res() res: Response) {
    const r = await this.aiProxyService.proxyRequest(req, `/api/logs/${encodeURIComponent(runId)}`);
    res.status(r.status).json(r.data);
  }

  // ── Generated Assets ────────────────────────────────────────────────────────

  @Get('generated-images/:fileName')
  async getGeneratedImage(@Param('fileName') fileName: string, @Res() res: Response) {
    const asset = await this.aiProxyService.proxyAsset(`/api/generated-images/${encodeURIComponent(fileName)}`);
    if (!asset.buffer) {
      res.status(asset.status).json({ error: 'Image not found' });
      return;
    }
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(asset.buffer);
  }
}
