import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorkflowRunDto } from './dto/create-workflow-run.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  /** Save or update a workflow (upsert by workflowId) */
  @Post()
  create(@Body() dto: CreateWorkflowDto, @Request() req: any) {
    return this.workflowsService.create(dto, req.user.id);
  }

  /** List all workflows for the authenticated user */
  @Get()
  findAll(@Request() req: any) {
    return this.workflowsService.findAll(req.user.id);
  }

  // ── Workflow Runs ──────────────────────────────────────────────────────────
  // Declared before `:workflowId` routes so static segments resolve first.

  /** List all runs across workflows for the authenticated user */
  @Get('runs/all')
  findAllRuns(@Query('limit') limit: string, @Request() req: any) {
    return this.workflowsService.findAllRuns(req.user.id, Number(limit));
  }

  /** Get a single run by its frontend runId */
  @Get('runs/:runId')
  findRun(@Param('runId') runId: string, @Request() req: any) {
    return this.workflowsService.findRun(runId, req.user.id);
  }

  /** Delete a single run */
  @Delete('runs/:runId')
  removeRun(@Param('runId') runId: string, @Request() req: any) {
    return this.workflowsService.removeRun(runId, req.user.id);
  }

  /** List runs of a workflow for the authenticated user */
  @Get(':workflowId/runs')
  findRuns(@Param('workflowId') workflowId: string, @Query('limit') limit: string, @Request() req: any) {
    return this.workflowsService.findRuns(workflowId, req.user.id, Number(limit));
  }

  /** Save a run for a workflow (upsert by runId) */
  @Post(':workflowId/runs')
  createRun(@Param('workflowId') workflowId: string, @Body() dto: CreateWorkflowRunDto, @Request() req: any) {
    return this.workflowsService.createRun(workflowId, dto, req.user.id);
  }

  /** Clear all runs of a workflow for the authenticated user */
  @Delete(':workflowId/runs')
  clearRuns(@Param('workflowId') workflowId: string, @Request() req: any) {
    return this.workflowsService.clearRuns(workflowId, req.user.id);
  }

  // ── Workflows by ID ────────────────────────────────────────────────────────

  /** Get a single workflow by its frontend workflowId */
  @Get(':workflowId')
  findOne(@Param('workflowId') workflowId: string, @Request() req: any) {
    return this.workflowsService.findOne(workflowId, req.user.id);
  }

  /** Update name / description / nodes / edges */
  @Patch(':workflowId')
  update(@Param('workflowId') workflowId: string, @Body() dto: UpdateWorkflowDto, @Request() req: any) {
    return this.workflowsService.update(workflowId, dto, req.user.id);
  }

  /** Delete a workflow */
  @Delete(':workflowId')
  remove(@Param('workflowId') workflowId: string, @Request() req: any) {
    return this.workflowsService.remove(workflowId, req.user.id);
  }
}
