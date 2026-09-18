import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
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
