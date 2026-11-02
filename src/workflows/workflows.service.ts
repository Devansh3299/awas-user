import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorkflowRunDto } from './dto/create-workflow-run.dto';

const LEGACY_TEMPLATE_WORKFLOW_NAMES = new Set([
  'text to image generation pipeline',
  'market intelligence & competitor research',
  'film & video production pipeline',
  'youtube video script & thumbnail concept generator',
  'financial news sentiment & market analysis',
  'patient reception, triage & appointment check-in',
  'intelligent file ingestion & record normalizer',
  'multi-agent autonomous workflow',
  'agent & workflow studio',
]);

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

    const saved = await this.prisma.workflow.upsert({
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

    if (dto.name && dto.name.trim()) {
      await this.prisma.workflowRun
        .updateMany({
          where: { workflowId: dto.workflowId },
          data: { workflowName: dto.name.trim() },
        })
        .catch(() => {});
    }

    return saved;
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

    const updated = await this.prisma.workflow.update({
      where: { workflowId },
      data,
    });

    if (dto.name && dto.name.trim()) {
      await this.prisma.workflowRun
        .updateMany({
          where: { workflowId },
          data: { workflowName: dto.name.trim() },
        })
        .catch(() => {});
    }

    return updated;
  }

  async remove(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findUnique({ where: { workflowId } });
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    if (workflow.userId !== userId) throw new ForbiddenException('You do not have permission to delete this workflow');

    // Also remove run history for the workflow
    await this.prisma.workflowRun.deleteMany({ where: { workflowId } });

    return await this.prisma.workflow.delete({ where: { workflowId } });
  }

  // ── Workflow Runs (Crew Studio "Runs" section) ──────────────────────────────

  /** Shape a DB run so the frontend can use it as-is (`id` = run-xxx, `timestamp` ISO string). */
  private serializeRun(run: any, overrideWorkflowName?: string) {
    if (!run) return run;
    const ts: Date = run.startedAt || run.createdAt;
    return {
      ...run,
      workflowName: overrideWorkflowName || run.workflowName || 'Workflow Execution',
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

  /** Save (upsert by runId) a run for the given workflow. */
  async createRun(workflowId: string, dto: CreateWorkflowRunDto, userId: string) {
    const runId = dto.runId || dto.id || `run-${Date.now()}`;
    const targetWorkflowId = dto.workflowId || workflowId;

    const [existing, wf] = await Promise.all([
      this.prisma.workflowRun.findUnique({ where: { runId } }),
      this.prisma.workflow.findUnique({
        where: { workflowId: targetWorkflowId },
        select: { name: true, userId: true },
      }),
    ]);

    const resolvedWorkflowName =
      wf?.name?.trim() ||
      dto.workflowName?.trim() ||
      existing?.workflowName ||
      'Workflow Execution';

    const rawDuration = dto.duration ?? dto.metrics?.duration ?? null;
    const durationStr =
      rawDuration === null || rawDuration === undefined
        ? null
        : typeof rawDuration === 'number'
          ? `${rawDuration}s`
          : String(rawDuration);

    const parsedAgentCount =
      dto.agentCount !== undefined && dto.agentCount !== null
        ? Number.isFinite(Number(dto.agentCount))
          ? Math.round(Number(dto.agentCount))
          : null
        : null;

    const outputStr =
      dto.outputResult === null || dto.outputResult === undefined
        ? null
        : typeof dto.outputResult === 'string'
          ? dto.outputResult
          : JSON.stringify(dto.outputResult, null, 2);

    const inputTopicStr =
      dto.inputTopic === null || dto.inputTopic === undefined
        ? null
        : String(dto.inputTopic);

    const errorStr =
      dto.error === null || dto.error === undefined ? null : String(dto.error);

    const rawTs = dto.timestamp || dto.startedAt;
    const parsedDate = rawTs ? new Date(rawTs) : new Date();
    const startedAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const ownerUserId = existing?.userId || wf?.userId || userId;

    const data: any = {
      workflowId: targetWorkflowId,
      userId: ownerUserId,
      workflowName: resolvedWorkflowName,
      status: dto.status || 'Success',
      duration: durationStr,
      agentCount: parsedAgentCount,
      agentsUsed: dto.agentsUsed ?? undefined,
      inputs: dto.inputs ?? undefined,
      inputTopic: inputTopicStr,
      outputResult: outputStr,
      logs: dto.logs ?? undefined,
      timelineTree: dto.timelineTree ?? undefined,
      metrics: dto.metrics ?? undefined,
      error: errorStr,
      startedAt,
    };

    const run = await this.prisma.workflowRun.upsert({
      where: { runId },
      update: data,
      create: { runId, ...data },
    });
    return this.serializeRun(run, resolvedWorkflowName);
  }

  /** List runs of one workflow (newest first). Never deletes runs on read. */
  async findRuns(workflowId: string, _userId: string, limit?: number) {
    const [wf, runs] = await Promise.all([
      this.prisma.workflow.findUnique({
        where: { workflowId },
        select: { name: true },
      }),
      this.prisma.workflowRun.findMany({
        where: { workflowId },
        orderBy: { startedAt: 'desc' },
        take: this.clampLimit(limit),
        select: this.runListSelect,
      }),
    ]);

    const realWorkflowName = wf?.name?.trim() || '';
    const expectedLower = realWorkflowName.toLowerCase();

    const filteredRuns = runs.filter((r: any) => {
      if (!expectedLower) return true;
      const rName = (r.workflowName || '').trim().toLowerCase();
      if (!rName || rName === 'workflow execution' || rName === expectedLower) {
        return true;
      }
      // Exclude legacy template-named runs from a custom-named workflow
      if (LEGACY_TEMPLATE_WORKFLOW_NAMES.has(rName) && !LEGACY_TEMPLATE_WORKFLOW_NAMES.has(expectedLower)) {
        return false;
      }
      return rName === expectedLower;
    });

    return filteredRuns.map((r: any) => ({
      ...this.serializeRun(r, realWorkflowName || undefined),
      isPartial: true,
    }));
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

  async findRun(runId: string, _userId: string) {
    const run = await this.prisma.workflowRun.findUnique({ where: { runId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return this.serializeRun(run);
  }

  async removeRun(runId: string, _userId: string) {
    const run = await this.prisma.workflowRun.findUnique({ where: { runId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    await this.prisma.workflowRun.delete({ where: { runId } });
    return { deleted: true, runId };
  }

  async clearRuns(workflowId: string, _userId: string) {
    const res = await this.prisma.workflowRun.deleteMany({ where: { workflowId } });
    return { deleted: res.count, workflowId };
  }
}
