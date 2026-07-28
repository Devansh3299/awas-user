import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  async create(createAgentDto: CreateAgentDto) {
    const { schema, ...data } = createAgentDto;
    return this.prisma.agent.create({
      data: { ...data, schema: schema ?? {} },
    });
  }

  async findAll() {
    return this.prisma.agent.findMany();
  }

  async findOne(id: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException(`Agent with ID ${id} not found`);
    return agent;
  }

  async findByMastraId(mastraId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { mastraId } });
    if (!agent) throw new NotFoundException(`Agent with mastraId ${mastraId} not found`);
    return agent;
  }

  async update(id: string, updateAgentDto: UpdateAgentDto) {
    const { schema, ...data } = updateAgentDto;
    const updateData: any = { ...data };
    if (schema) updateData.schema = schema;
    try {
      return await this.prisma.agent.update({ where: { id }, data: updateData });
    } catch {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.agent.delete({ where: { id } });
    } catch {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }
  }
}
