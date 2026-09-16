import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AgentsModule } from './agents/agents.module';
import { AiProxyModule } from './ai-proxy/ai-proxy.module';
import { TokensModule } from './tokens/tokens.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, AgentsModule, AiProxyModule, TokensModule, WorkflowsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

