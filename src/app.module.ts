import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AgentsModule } from './agents/agents.module';
import { AiProxyModule } from './ai-proxy/ai-proxy.module';
import { TokensModule } from './tokens/tokens.module';
import { LlmModelsModule } from './llm-models/llm-models.module';
import { LlmConnectionModule } from './llm-connection/llm-connection.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    AgentsModule,
    AiProxyModule,
    TokensModule,
    LlmModelsModule,
    LlmConnectionModule,
    WorkflowsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
