import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ToolsService } from './tools.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SaveToolConnectionDto, TestToolConnectionDto } from './dto/tool-connection.dto';
import { ToolExecuteDto } from './dto/tool-execute.dto';
import type { Request } from 'express';

@Controller()
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  // ── Tools Catalogue Endpoints ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get(['ai/tools', 'tools'])
  async listTools(
    @Query('category') category?: string,
    @Query('q') query?: string,
  ) {
    return this.toolsService.listTools(category, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(['ai/tools/:id', 'tools/:id'])
  async getToolById(@Param('id') toolId: string) {
    return this.toolsService.getToolById(toolId);
  }

  // ── Sandbox Tool Execution ────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post(['ai/tools/:id/execute', 'tools/:id/execute'])
  @HttpCode(HttpStatus.OK)
  async executeTool(
    @Param('id') toolId: string,
    @Body() body: ToolExecuteDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as any)?.id || 'anonymous';
    const inputData = body.inputData ?? body.input ?? body;
    return this.toolsService.executeTool(toolId, inputData, userId);
  }

  // ── Tool Application Connections & Credentials ────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get(['tools/connections', 'ai/tools/connections'])
  async listConnections(@Req() req: Request) {
    const userId = (req.user as any)?.id;
    return this.toolsService.listConnections(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(['tools/connections/:id', 'ai/tools/connections/:id'])
  async saveConnection(
    @Param('id') toolId: string,
    @Body() dto: SaveToolConnectionDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as any)?.id;
    return this.toolsService.saveConnection(userId, toolId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(['tools/connections/:id', 'ai/tools/connections/:id'])
  async deleteConnection(
    @Param('id') toolId: string,
    @Req() req: Request,
  ) {
    const userId = (req.user as any)?.id;
    return this.toolsService.deleteConnection(userId, toolId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(['tools/connections/:id/test', 'ai/tools/connections/:id/test'])
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @Param('id') toolId: string,
    @Body() dto: TestToolConnectionDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as any)?.id;
    return this.toolsService.testConnection(userId, toolId, dto);
  }
}
