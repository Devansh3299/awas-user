import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { LlmConnectionService, DEFAULT_LM_STUDIO_URL } from './llm-connection.service';
import { CreateLlmConnectionDto } from './dto/create-llm-connection.dto';
import { TestLlmConnectionDto } from './dto/test-llm-connection.dto';
import { SyncModelsDto } from './dto/sync-models.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@Controller('llm-connection')
@UseGuards(JwtAuthGuard)
export class LlmConnectionController {
  constructor(private readonly llmConnectionService: LlmConnectionService) {}

  /**
   * GET /llm-connection
   *
   * Returns all provider catalogs enriched with user connection settings
   * from the `llmConnection` collection in MongoDB.
   */
  @Get()
  async getAllConnections(@Req() req: Request) {
    const userId = (req.user as any)?.id;
    return this.llmConnectionService.getAllConnections(userId);
  }

  /**
   * GET /llm-connection/lm-studio/live-models
   *
   * Fetches models directly from LM Studio at http://127.0.0.1:1234/v1/models.
   */
  @Get('lm-studio/live-models')
  async getLmStudioLiveModels(@Query('baseUrl') baseUrl?: string) {
    return this.llmConnectionService.fetchLiveModels('lm-studio', baseUrl || DEFAULT_LM_STUDIO_URL);
  }

  /**
   * GET /llm-connection/:providerId
   *
   * Returns a single provider connection from the `llmConnection` collection.
   */
  @Get(':providerId')
  async getConnection(@Req() req: Request, @Param('providerId') providerId: string) {
    const userId = (req.user as any)?.id;
    return this.llmConnectionService.getConnection(userId, providerId);
  }

  /**
   * POST /llm-connection
   *
   * Creates or updates an LLM Connection record in the `llmConnection` collection.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async saveConnection(@Req() req: Request, @Body() dto: CreateLlmConnectionDto) {
    const userId = (req.user as any)?.id;
    return this.llmConnectionService.saveConnection(userId, dto);
  }

  /**
   * DELETE /llm-connection/:providerId
   *
   * Removes connection configuration from the `llmConnection` collection.
   */
  @Delete(':providerId')
  async deleteConnection(@Req() req: Request, @Param('providerId') providerId: string) {
    const userId = (req.user as any)?.id;
    return this.llmConnectionService.deleteConnection(userId, providerId);
  }

  /**
   * POST /llm-connection/test
   *
   * Tests connectivity, latency, and completions against the provider (e.g. LM Studio).
   * Updates testStatus, lastTested, and latencyMs in the `llmConnection` collection.
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testConnection(@Req() req: Request, @Body() body: TestLlmConnectionDto) {
    const userId = (req.user as any)?.id;
    return this.llmConnectionService.testConnection(
      userId,
      body.providerId,
      body.baseUrl,
      body.apiKey,
      body.modelId,
    );
  }

  /**
   * POST /llm-connection/sync-models
   *
   * Queries provider (e.g. LM Studio running at http://127.0.0.1:1234) for loaded models,
   * stores them in `availableModels` in the `llmConnection` MongoDB collection,
   * and returns the updated model list.
   */
  @Post('sync-models')
  @HttpCode(HttpStatus.OK)
  async syncModels(@Req() req: Request, @Body() body: SyncModelsDto) {
    const userId = (req.user as any)?.id;
    return this.llmConnectionService.syncAvailableModels(
      userId,
      body.providerId,
      body.baseUrl,
      body.apiKey,
    );
  }
}
