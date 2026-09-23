import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

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
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    if (workflow.userId !== userId) throw new UnauthorizedException('You do not have permission to view this workflow');
    return workflow;
  }

  async update(workflowId: string, dto: UpdateWorkflowDto, userId: string) {
    const workflow = await this.prisma.workflow.findUnique({ where: { workflowId } });
    if (!workflow) throw new NotFoundException(`Workflow ${workflowId} not found`);
    if (workflow.userId !== userId) throw new UnauthorizedException('You do not have permission to modify this workflow');

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
    if (workflow.userId !== userId) throw new UnauthorizedException('You do not have permission to delete this workflow');

    return await this.prisma.workflow.delete({ where: { workflowId } });
  }
}
