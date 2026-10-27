import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { SyncThreadDto } from './dto/sync-chat.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * List threads for authenticated user.
   * Can be filtered by type ('studio' | 'agent' | 'workflow'), agentId, or workflowId.
   */
  @Get('threads')
  getThreads(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('agentId') agentId?: string,
    @Query('workflowId') workflowId?: string,
  ) {
    return this.chatService.getThreads(req.user.id, { type, agentId, workflowId });
  }

  /**
   * Get a specific thread and its full message history.
   */
  @Get('threads/:threadId')
  getThread(@Request() req: any, @Param('threadId') threadId: string) {
    return this.chatService.getThread(req.user.id, threadId);
  }

  /**
   * Create or fetch a thread.
   */
  @Post('threads')
  createOrGetThread(@Request() req: any, @Body() dto: CreateThreadDto) {
    return this.chatService.createOrGetThread(req.user.id, dto);
  }

  /**
   * Update thread title or metadata.
   */
  @Patch('threads/:threadId')
  updateThread(
    @Request() req: any,
    @Param('threadId') threadId: string,
    @Body() dto: Partial<CreateThreadDto>,
  ) {
    return this.chatService.updateThread(req.user.id, threadId, dto);
  }

  /**
   * Delete a thread and its messages.
   */
  @Delete('threads/:threadId')
  deleteThread(@Request() req: any, @Param('threadId') threadId: string) {
    return this.chatService.deleteThread(req.user.id, threadId);
  }

  /**
   * Add or update a message in a thread.
   */
  @Post('threads/:threadId/messages')
  saveMessage(
    @Request() req: any,
    @Param('threadId') threadId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.chatService.saveMessage(req.user.id, threadId, dto);
  }

  /**
   * Clear all messages in a thread.
   */
  @Delete('threads/:threadId/messages')
  clearMessages(@Request() req: any, @Param('threadId') threadId: string) {
    return this.chatService.clearMessages(req.user.id, threadId);
  }

  /**
   * Bulk sync a thread and its messages.
   */
  @Post('sync')
  syncThread(@Request() req: any, @Body() dto: SyncThreadDto) {
    return this.chatService.syncThread(req.user.id, dto);
  }
}
