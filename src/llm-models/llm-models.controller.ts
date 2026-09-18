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
} from '@nestjs/common';
import { LlmModelsService } from './llm-models.service';
import { SaveModelConfigDto } from './dto/save-model-config.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@Controller('ai/models')
@UseGuards(JwtAuthGuard)
export class LlmModelsController {
  constructor(private readonly llmModelsService: LlmModelsService) {}

  /**
   * GET /ai/models
   *
   * Returns the full provider catalogue enriched with:
   *  - Active status from Mastra (proxied from /api/models).
   *  - User's saved config (masked API key, baseUrl, modelId, test status).
   *
   * This is the primary endpoint the LLM Connections page fetches on load.
   */
  @Get()
  async listProviders(@Req() req: Request) {
    const userId = (req.user as any)?.id;
    return this.llmModelsService.getProviders(userId);
  }

  /**
   * GET /ai/models/config
   *
   * Returns only the user's saved model configurations (without catalogue metadata).
   * Useful for lightweight reads (e.g., agent detail model selector).
   */
  @Get('config')
  async getUserConfigs(@Req() req: Request) {
    const userId = (req.user as any)?.id;
    return this.llmModelsService.getUserConfigs(userId);
  }

  /**
   * POST /ai/models/config
   *
   * Creates or updates a model provider configuration for the authenticated user.
   * Stores API key as base64-encoded string. Sets default provider if requested.
   *
   * Body: SaveModelConfigDto
   */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(@Req() req: Request, @Body() dto: SaveModelConfigDto) {
    const userId = (req.user as any)?.id;
    return this.llmModelsService.saveConfig(userId, dto);
  }

  /**
   * DELETE /ai/models/config/:providerId
   *
   * Removes the saved configuration for the specified provider.
   */
  @Delete('config/:providerId')
  async deleteConfig(@Req() req: Request, @Param('providerId') providerId: string) {
    const userId = (req.user as any)?.id;
    return this.llmModelsService.deleteConfig(userId, providerId);
  }

  /**
   * POST /ai/models/test
   *
   * Tests connectivity for a given provider.
   * Proxies to Mastra /api/models/test if available, falls back to direct ping.
   *
   * Body: { providerId, apiKey?, baseUrl?, modelId? }
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @Req() req: Request,
    @Body() body: { providerId: string; apiKey?: string; baseUrl?: string; modelId?: string },
  ) {
    const userId = (req.user as any)?.id;
    return this.llmModelsService.testConnection(
      userId,
      body.providerId,
      body.apiKey,
      body.baseUrl,
      body.modelId,
    );
  }
}
