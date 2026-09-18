import { Module } from '@nestjs/common';
import { LlmConnectionController } from './llm-connection.controller';
import { LlmConnectionService } from './llm-connection.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LlmConnectionController],
  providers: [LlmConnectionService],
  exports: [LlmConnectionService],
})
export class LlmConnectionModule {}
