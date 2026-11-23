import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AgentMetadataService } from './agent-metadata.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentMetadataService],
  exports: [AgentsService, AgentMetadataService],
})
export class AgentsModule {}
