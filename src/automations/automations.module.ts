import { Module } from '@nestjs/common';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiProxyModule } from '../ai-proxy/ai-proxy.module';

@Module({
  imports: [PrismaModule, AiProxyModule],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
