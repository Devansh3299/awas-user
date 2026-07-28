import { Module } from '@nestjs/common';
import { TokensService } from './tokens.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}