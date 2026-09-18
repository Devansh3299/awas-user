import { Module } from '@nestjs/common';
import { LlmModelsController } from './llm-models.controller';
import { LlmModelsService } from './llm-models.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { LlmConnectionModule } from '../llm-connection/llm-connection.module';

@Module({
  imports: [PrismaModule, AuthModule, LlmConnectionModule],
  controllers: [LlmModelsController],
  providers: [LlmModelsService],
  exports: [LlmModelsService],
})
export class LlmModelsModule {}

