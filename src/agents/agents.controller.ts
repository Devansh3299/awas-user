import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@Req() req: any) {
    return this.agentsService.findAll(req.user?.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('by-mastra-id/:mastraId')
  findByMastraId(@Param('mastraId') mastraId: string, @Req() req: any) {
    return this.agentsService.findByMastraId(mastraId, req.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createAgentDto: CreateAgentDto, @Req() req: any) {
    return this.agentsService.create(createAgentDto, req.user.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.agentsService.findOne(id, req.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAgentDto: UpdateAgentDto, @Req() req: any) {
    return this.agentsService.update(id, updateAgentDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.agentsService.remove(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.agentsService.publish(id, body, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @Req() req: any) {
    return this.agentsService.unpublish(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/install')
  install(@Param('id') id: string, @Req() req: any) {
    return this.agentsService.install(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/install')
  uninstall(@Param('id') id: string, @Req() req: any) {
    return this.agentsService.uninstall(id, req.user.id);
  }
}
