import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Headers,
  Query,
} from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';
import { TriggerAutomationDto } from './dto/trigger-automation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('automations')
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  /**
   * Public webhook trigger endpoint for external systems (GitHub, Slack, Zapier, scripts)
   */
  @Post('webhook/:slugOrId')
  handleWebhook(
    @Param('slugOrId') slugOrId: string,
    @Headers('x-webhook-secret') secretHeader?: string,
    @Query('secret') secretQuery?: string,
    @Body() body?: any,
  ) {
    return this.automationsService.handleWebhook(
      slugOrId,
      secretHeader || secretQuery,
      body,
    );
  }

  /**
   * List all automations for authenticated user + aggregate stats
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Request() req: any) {
    return this.automationsService.findAll(req.user.id);
  }

  /**
   * Create new automation
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateAutomationDto, @Request() req: any) {
    return this.automationsService.create(dto, req.user.id);
  }

  /**
   * Fetch all execution run logs across all automations for user (for central Log Viewer)
   */
  @Get('runs/all')
  @UseGuards(JwtAuthGuard)
  getAllRuns(@Request() req: any, @Query('limit') limit?: string) {
    return this.automationsService.getAllRuns(
      req.user.id,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  /**
   * Explicitly restore/seed starter templates for user
   */
  @Post('seed-defaults')
  @UseGuards(JwtAuthGuard)
  seedDefaults(@Request() req: any) {
    return this.automationsService.seedTemplatesForUser(req.user.id);
  }

  /**
   * Get single automation with recent run history
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.automationsService.findOne(id, req.user.id);
  }

  /**
   * Update automation configuration
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
    @Request() req: any,
  ) {
    return this.automationsService.update(id, dto, req.user.id);
  }

  /**
   * Delete ALL automations for user
   */
  @Delete('all')
  @UseGuards(JwtAuthGuard)
  removeAll(@Request() req: any) {
    return this.automationsService.removeAll(req.user.id);
  }

  /**
   * Delete single automation
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.automationsService.remove(id, req.user.id);
  }

  /**
   * Toggle Active <-> Paused status
   */
  @Post(':id/toggle')
  @UseGuards(JwtAuthGuard)
  toggleStatus(@Param('id') id: string, @Request() req: any) {
    return this.automationsService.toggleStatus(id, req.user.id);
  }

  /**
   * Trigger automation execution run immediately
   */
  @Post(':id/trigger')
  @UseGuards(JwtAuthGuard)
  trigger(
    @Param('id') id: string,
    @Body() dto: TriggerAutomationDto,
    @Request() req: any,
  ) {
    return this.automationsService.trigger(id, req.user.id, dto, 'manual');
  }

  /**
   * Fetch execution history runs for automation
   */
  @Get(':id/runs')
  @UseGuards(JwtAuthGuard)
  getRuns(@Param('id') id: string, @Request() req: any) {
    return this.automationsService.getRuns(id, req.user.id);
  }
}
