import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  // Public — client needs pricing without auth
  @Get()
  findAll() {
    return this.agentsService.findAll();
  }

  @Get('by-mastra-id/:mastraId')
  findByMastraId(@Param('mastraId') mastraId: string) {
    return this.agentsService.findByMastraId(mastraId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createAgentDto: CreateAgentDto) {
    return this.agentsService.create(createAgentDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAgentDto: UpdateAgentDto) {
    return this.agentsService.update(id, updateAgentDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.agentsService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const userId = req.user?.id;
    return this.agentsService.publish(id, body, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.agentsService.unpublish(id);
  }
}

