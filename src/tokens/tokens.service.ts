import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * TEMPORARY: Unlimited token mode.
 * While UNLIMITED_TOKENS is true, every user is treated as having an infinite
 * balance and no tokens are deducted. Set to false to restore normal metering.
 */
const UNLIMITED_TOKENS = true;

@Injectable()
export class TokensService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string): Promise<number> {
    if (UNLIMITED_TOKENS) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (!userId || userId === 'default-user') {
      return 1000;
    }
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return 1000;
      }
      const balance = Number(user.tokenBalance ?? 0);
      return Number.isFinite(balance) ? balance : 0;
    } catch {
      return 1000;
    }
  }

  async deductTokens(userId: string, amount: number): Promise<void> {
    if (UNLIMITED_TOKENS) {
      return;
    }
    if (!userId || userId === 'default-user') {
      return;
    }
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { tokenBalance: { decrement: amount } },
      });
    } catch {}
  }

  async hasSufficientBalance(userId: string, requiredTokens: number): Promise<boolean> {
    if (UNLIMITED_TOKENS) {
      return true;
    }
    const balance = await this.getBalance(userId);
    return balance >= requiredTokens;
  }
}
