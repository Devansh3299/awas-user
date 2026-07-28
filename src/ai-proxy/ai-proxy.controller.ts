import { Controller, Get, Post, Body, Param, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request, Response } from 'express';

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
  @Post('agents/:id/generate')
  @HttpCode(HttpStatus.OK)
  async generate(
    @Param('id') agentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { messages, threadId } = req.body ?? {};
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
    const mastraResponse = await this.aiProxyService.proxyRequest(req, `/api/agents/${agentId}/generate`);
    await this.aiProxyService.deductTokens(userId);
    res.status(mastraResponse.status).json(mastraResponse.data);
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
}