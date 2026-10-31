import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorkflowRunDto } from './dto/create-workflow-run.dto';

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateWorkflowDto, userId: string) {
    const existing = await this.prisma.workflow.findUnique({
      where: { workflowId: dto.workflowId },
    });

    const updateData: any = {
      name: dto.name,
      nodes: dto.nodes ?? [],
      edges: dto.edges ?? [],
      userId,
    };

    // Only set/update description if provided in DTO, preserving existing description if omitted
    if (dto.description !== undefined) {
      updateData.description = dto.description;
    } else if (existing?.description !== undefined) {
      updateData.description = existing.description;
    }

    return this.prisma.workflow.upsert({
      where: { workflowId: dto.workflowId },
      update: updateData,
      create: {
        workflowId: dto.workflowId,
        name: dto.name,
        description: dto.description ?? '',
        nodes: dto.nodes ?? [],
        edges: dto.edges ?? [],
        userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.workflow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { workflowId },
    });

    if (!workflow) {
      // Check if this workflow exists in the public marketplace collection
      const mpItem = await (this.prisma as any).marketplaceItem.findFirst({
        where: {
          OR: [{ itemId: workflowId }, { id: workflowId }],
          type: 'workflow',
          isPublished: true,
        },
      });

      if (mpItem) {
        return {
          id: mpItem.id,
          workflowId: mpItem.itemId,
          name: mpItem.name,
          description: mpItem.description ?? '',
          nodes: mpItem.data?.nodes ?? [],
          edges: mpItem.data?.edges ?? [],
          userId: mpItem.userId,
          isMarketplace: true,
        };
      }

      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    if (workflow.userId !== userId) {
      // Check if this workflow is published in the marketplace
      const mpItem = await (this.prisma as any).marketplaceItem.findFirst({
        where: { itemId: workflowId, type: 'workflow', isPublished: true },
      });

      if (mpItem) {
        return {
          ...workflow,
          isMarketplace: true,
        };
      }

      throw new ForbiddenException('You do not have permission to view this workflow');
    }

    return workflow;
  }

  async update(workflowId: string, dto: UpdateWorkflowDto, userId: string) {
    const workflow = await this.prisma.workflow.findUnique({ where: { workflowId } });
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    if (workflow.userId !== userId) throw new ForbiddenException('You do not have permission to modify this workflow');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.nodes !== undefined) data.nodes = dto.nodes;
    if (dto.edges !== undefined) data.edges = dto.edges;

    return await this.prisma.workflow.update({
      where: { workflowId },
      data,
    });
  }

  async remove(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findUnique({ where: { workflowId } });
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    if (workflow.userId !== userId) throw new ForbiddenException('You do not have permission to delete this workflow');

    // Also remove this user's run history for the workflow
    await this.prisma.workflowRun.deleteMany({ where: { workflowId, userId } });

    return await this.prisma.workflow.delete({ where: { workflowId } });
  }

  // ── Workflow Runs (Crew Studio "Runs" section) ──────────────────────────────

  /** Shape a DB run so the frontend can use it as-is (`id` = run-xxx, `timestamp` ISO string). */
  private serializeRun(run: any) {
    if (!run) return run;
    const ts: Date = run.startedAt || run.createdAt;
    return {
      ...run,
      _id: run.id,
      id: run.runId,
      timestamp: ts instanceof Date ? ts.toISOString() : ts,
    };
  }

  private clampLimit(limit?: number) {
    const n = Number(limit) || 100;
    return Math.min(Math.max(n, 1), 500);
  }

  /**
   * Lightweight projection for run lists: excludes the heavy `timelineTree` / `logs`
   * (can be hundreds of KB per run). Full run is loaded via GET /workflows/runs/:runId.
   */
  private readonly runListSelect = {
    id: true,
    runId: true,
    workflowId: true,
    userId: true,
    workflowName: true,
    status: true,
    duration: true,
    agentCount: true,
    agentsUsed: true,
    inputs: true,
    inputTopic: true,
    outputResult: true,
    metrics: true,
    error: true,
    startedAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  /** Save (upsert by runId) a run for the given workflow, owned by the authenticated user. */
  async createRun(workflowId: string, dto: CreateWorkflowRunDto, userId: string) {
    const runId = dto.runId || `run-${Date.now()}`;

    const existing = await this.prisma.workflowRun.findUnique({ where: { runId } });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException('You do not have permission to modify this run');
    }

    const data: any = {
      workflowId: dto.workflowId || workflowId,
      userId,
      workflowName: dto.workflowName || 'Workflow Execution',
      status: dto.status || 'Success',
      duration: dto.duration ?? dto.metrics?.duration ?? null,
      agentCount: dto.agentCount ?? null,
      agentsUsed: dto.agentsUsed ?? undefined,
      inputs: dto.inputs ?? undefined,
      inputTopic: dto.inputTopic ?? null,
      outputResult: dto.outputResult ?? null,
      logs: dto.logs ?? undefined,
      timelineTree: dto.timelineTree ?? undefined,
      metrics: dto.metrics ?? undefined,
      error: dto.error ?? null,
      startedAt: dto.timestamp ? new Date(dto.timestamp) : new Date(),
    };

    const run = await this.prisma.workflowRun.upsert({
      where: { runId },
      update: data,
      create: { runId, ...data },
    });
    return this.serializeRun(run);
  }

  /** List runs of one workflow for the authenticated user (newest first). */
  async findRuns(workflowId: string, userId: string, limit?: number) {
    const runs = await this.prisma.workflowRun.findMany({
      where: { workflowId, userId },
      orderBy: { startedAt: 'desc' },
      take: this.clampLimit(limit),
      select: this.runListSelect,
    });
    return runs.map((r: any) => ({ ...this.serializeRun(r), isPartial: true }));
  }

  /** List runs across all workflows for the authenticated user (newest first). */
  async findAllRuns(userId: string, limit?: number) {
    const runs = await this.prisma.workflowRun.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: this.clampLimit(limit),
      select: this.runListSelect,
    });
    return runs.map((r: any) => ({ ...this.serializeRun(r), isPartial: true }));
  }

  async findRun(runId: string, userId: string) {
    const run = await this.prisma.workflowRun.findUnique({ where: { runId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    if (run.userId !== userId) throw new ForbiddenException('You do not have permission to view this run');
    return this.serializeRun(run);
  }

  async removeRun(runId: string, userId: string) {
    const run = await this.prisma.workflowRun.findUnique({ where: { runId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    if (run.userId !== userId) throw new ForbiddenException('You do not have permission to delete this run');
    await this.prisma.workflowRun.delete({ where: { runId } });
    return { deleted: true, runId };
  }

  async clearRuns(workflowId: string, userId: string) {
    const res = await this.prisma.workflowRun.deleteMany({ where: { workflowId, userId } });
    return { deleted: res.count, workflowId };
  }
}
