import { Module } from '@nestjs/common';
import { AiProxyController } from './ai-proxy.controller';
import { AiProxyService } from './ai-proxy.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TokensModule } from '../tokens/tokens.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [PrismaModule, AuthModule, TokensModule, AgentsModule],
  controllers: [AiProxyController],
  providers: [AiProxyService],
  exports: [AiProxyService],
})
export class AiProxyModule {}
