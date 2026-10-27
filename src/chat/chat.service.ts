import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { SyncThreadDto } from './dto/sync-chat.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  private get chatThreadModel(): any {
    return (this.prisma as any).chatThread;
  }

  private get chatMessageModel(): any {
    return (this.prisma as any).chatMessage;
  }

  /**
   * List threads for a specific user, with optional filters for type, agentId, or workflowId.
   */
  async getThreads(userId: string, filters?: { type?: string; agentId?: string; workflowId?: string }) {
    const where: any = { userId };

    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.agentId) {
      where.agentId = filters.agentId;
    }
    if (filters?.workflowId) {
      where.workflowId = filters.workflowId;
    }

    const threads = await this.chatThreadModel.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return threads.map((t: any) => ({
      id: t.id,
      threadId: t.threadId,
      title: t.title,
      type: t.type,
      agentId: t.agentId,
      workflowId: t.workflowId,
      metadata: t.metadata,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      lastMessage: t.messages?.[0] || null,
    }));
  }

  /**
   * Retrieve a single thread with all its messages ordered chronologically.
   */
  async getThread(userId: string, threadId: string) {
    const thread = await this.chatThreadModel.findFirst({
      where: {
        threadId,
        userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException(`Chat thread '${threadId}' not found.`);
    }

    return thread;
  }

  /**
   * Create or fetch a thread for the given user, agent, or workflow.
   */
  async createOrGetThread(userId: string, dto: CreateThreadDto) {
    const targetThreadId = dto.threadId || `thread-${randomUUID()}`;

    const existing = await this.chatThreadModel.findFirst({
      where: { threadId: targetThreadId },
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('Access denied to this chat thread.');
      }
      return existing;
    }

    let defaultTitle = dto.title || 'New Chat';
    if (!dto.title) {
      if (dto.workflowId) {
        defaultTitle = `Workflow Chat (${dto.workflowId})`;
      } else if (dto.agentId && dto.agentId !== 'studio-chat-agent') {
        defaultTitle = `Chat with ${dto.agentId}`;
      }
    }

    return this.chatThreadModel.create({
      data: {
        threadId: targetThreadId,
        title: defaultTitle,
        type: dto.type || (dto.workflowId ? 'workflow' : dto.agentId ? 'agent' : 'studio'),
        userId,
        agentId: dto.agentId || null,
        workflowId: dto.workflowId || null,
        metadata: dto.metadata || {},
      },
    });
  }

  /**
   * Update thread metadata or title.
   */
  async updateThread(userId: string, threadId: string, dto: Partial<CreateThreadDto>) {
    const thread = await this.chatThreadModel.findFirst({
      where: { threadId, userId },
    });

    if (!thread) {
      throw new NotFoundException(`Chat thread '${threadId}' not found.`);
    }

    const dataToUpdate: any = {};
    if (dto.title !== undefined) dataToUpdate.title = dto.title;
    if (dto.metadata !== undefined) dataToUpdate.metadata = dto.metadata;

    return this.chatThreadModel.update({
      where: { id: thread.id },
      data: dataToUpdate,
    });
  }

  /**
   * Delete a thread and all associated messages.
   */
  async deleteThread(userId: string, threadId: string) {
    const thread = await this.chatThreadModel.findFirst({
      where: { threadId, userId },
    });

    if (!thread) {
      throw new NotFoundException(`Chat thread '${threadId}' not found.`);
    }

    // Cascade delete messages then thread
    await this.chatMessageModel.deleteMany({
      where: { chatThreadId: thread.id },
    });

    await this.chatThreadModel.delete({
      where: { id: thread.id },
    });

    return { success: true, deletedThreadId: threadId };
  }

  /**
   * Save or update a message in a thread.
   * If messageId matches an existing message in this thread, it updates it (handles streaming chunks & token usage).
   */
  async saveMessage(userId: string, threadId: string, dto: CreateMessageDto) {
    let thread = await this.chatThreadModel.findFirst({
      where: { threadId, userId },
    });

    // Auto-create thread if it doesn't exist yet
    if (!thread) {
      thread = await this.createOrGetThread(userId, {
        threadId,
        title: dto.role === 'user' && dto.content ? dto.content.slice(0, 40) : 'New Chat',
      });
    }

    const clientMsgId = dto.messageId || `msg-${randomUUID()}`;

    // Check if message with this messageId already exists in this thread
    const existingMsg = await this.chatMessageModel.findFirst({
      where: {
        chatThreadId: thread.id,
        messageId: clientMsgId,
      },
    });

    let savedMsg;
    if (existingMsg) {
      savedMsg = await this.chatMessageModel.update({
        where: { id: existingMsg.id },
        data: {
          content: dto.content !== undefined ? dto.content : existingMsg.content,
          reasoning: dto.reasoning !== undefined ? dto.reasoning : existingMsg.reasoning,
          toolCalls: dto.toolCalls !== undefined ? dto.toolCalls : existingMsg.toolCalls,
          usage: dto.usage !== undefined ? dto.usage : existingMsg.usage,
          feedback: dto.feedback !== undefined ? dto.feedback : existingMsg.feedback,
          metadata: dto.metadata !== undefined ? dto.metadata : existingMsg.metadata,
        },
      });
    } else {
      savedMsg = await this.chatMessageModel.create({
        data: {
          messageId: clientMsgId,
          chatThreadId: thread.id,
          role: dto.role,
          content: dto.content || '',
          reasoning: dto.reasoning || null,
          toolCalls: dto.toolCalls || null,
          usage: dto.usage || null,
          feedback: dto.feedback || null,
          metadata: dto.metadata || null,
        },
      });

      // If this is the first user message and the thread still has a generic name, give it a helpful title
      if (dto.role === 'user' && dto.content && (!thread.title || thread.title === 'New Chat')) {
        const smartTitle = dto.content.trim().slice(0, 48);
        if (smartTitle) {
          await this.chatThreadModel.update({
            where: { id: thread.id },
            data: { title: smartTitle },
          });
        }
      }
    }

    // Touch thread updatedAt
    await this.chatThreadModel.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    return savedMsg;
  }

  /**
   * Clear all messages in a thread without deleting the thread itself.
   */
  async clearMessages(userId: string, threadId: string) {
    const thread = await this.chatThreadModel.findFirst({
      where: { threadId, userId },
    });

    if (!thread) {
      throw new NotFoundException(`Chat thread '${threadId}' not found.`);
    }

    await this.chatMessageModel.deleteMany({
      where: { chatThreadId: thread.id },
    });

    await this.chatThreadModel.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    return { success: true, clearedThreadId: threadId };
  }

  /**
   * Sync a complete thread with an array of messages (bulk save / migration from local state).
   */
  async syncThread(userId: string, dto: SyncThreadDto) {
    let thread = await this.chatThreadModel.findFirst({
      where: { threadId: dto.threadId },
    });

    if (thread) {
      if (thread.userId !== userId) {
        throw new ForbiddenException('Access denied to this chat thread.');
      }
      if (dto.title || dto.metadata) {
        thread = await this.chatThreadModel.update({
          where: { id: thread.id },
          data: {
            title: dto.title || thread.title,
            metadata: dto.metadata || thread.metadata,
            updatedAt: new Date(),
          },
        });
      }
    } else {
      thread = await this.chatThreadModel.create({
        data: {
          threadId: dto.threadId,
          title: dto.title || 'Chat',
          type: dto.type || (dto.workflowId ? 'workflow' : dto.agentId ? 'agent' : 'studio'),
          userId,
          agentId: dto.agentId || null,
          workflowId: dto.workflowId || null,
          metadata: dto.metadata || {},
        },
      });
    }

    // Upsert messages
    const incomingMessages = dto.messages || [];
    for (const msg of incomingMessages) {
      const msgId = msg.id || msg.messageId || `msg-${randomUUID()}`;
      const existing = await this.chatMessageModel.findFirst({
        where: {
          chatThreadId: thread.id,
          messageId: msgId,
        },
      });

      if (existing) {
        await this.chatMessageModel.update({
          where: { id: existing.id },
          data: {
            content: msg.content ?? existing.content,
            reasoning: msg.reasoning ?? existing.reasoning,
            toolCalls: msg.toolCalls ?? existing.toolCalls,
            usage: msg.usage ?? existing.usage,
            feedback: msg.feedback ?? existing.feedback,
            metadata: msg.metadata ?? existing.metadata,
          },
        });
      } else {
        await this.chatMessageModel.create({
          data: {
            messageId: msgId,
            chatThreadId: thread.id,
            role: msg.role || 'user',
            content: msg.content || '',
            reasoning: msg.reasoning || null,
            toolCalls: msg.toolCalls || null,
            usage: msg.usage || null,
            feedback: msg.feedback || null,
            metadata: msg.metadata || null,
            createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          },
        });
      }
    }

    return this.getThread(userId, thread.threadId);
  }
}
