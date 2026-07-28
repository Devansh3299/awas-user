import { Module } from '@nestjs/common';
import { AiProxyController } from './ai-proxy.controller';
import { AiProxyService } from './ai-proxy.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [PrismaModule, AuthModule, TokensModule],
  controllers: [AiProxyController],
  providers: [AiProxyService],
})
export class AiProxyModule {}