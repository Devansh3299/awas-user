import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TokensService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const balance = Number(user.tokenBalance ?? 0);
    return Number.isFinite(balance) ? balance : 0;
  }

  async deductTokens(userId: string, amount: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenBalance: { decrement: amount } },
    });
  }

  async hasSufficientBalance(userId: string, requiredTokens: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= requiredTokens;
  }
}