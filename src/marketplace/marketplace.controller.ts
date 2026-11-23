import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { PublishMarketplaceItemDto } from './dto/publish-marketplace-item.dto';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Helper to optionally extract authenticated user from Authorization header.
   */
  private extractAuthUser(req: any) {
    try {
      const authHeader = req.headers?.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded: any = this.jwtService.decode(token);
        if (decoded?.sub || decoded?.id) {
          return {
            id: decoded.sub || decoded.id,
            email: decoded.email,
            role: decoded.role,
          };
        }
      }
    } catch {
      // ignore token decode errors and proceed gracefully
    }
    return null;
  }

  /**
   * Public: List all published marketplace items (workflows & agents).
   */
  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.marketplaceService.findAll({ type, category, search });
  }

  /**
   * Authenticated: List items installed by the current user.
   */
  @UseGuards(JwtAuthGuard)
  @Get('installed')
  getInstalled(@Req() req: any, @Query('type') type?: string) {
    return this.marketplaceService.getInstalledItems(req.user, type);
  }

  /**
   * Authenticated: List update requests (for owner or requester).
   */
  @UseGuards(JwtAuthGuard)
  @Get('update-requests')
  listUpdateRequests(@Req() req: any, @Query('itemId') itemId?: string) {
    return this.marketplaceService.listUpdateRequests(req.user, itemId);
  }

  /**
   * Authenticated: Update status of an update request (owner-only).
   */
  @UseGuards(JwtAuthGuard)
  @Patch('update-requests/:requestId')
  updateRequestStatus(
    @Param('requestId') requestId: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.marketplaceService.updateRequestStatus(requestId, body?.status, req.user);
  }

  /**
   * Authenticated: Publish or re-publish an agent or workflow to the marketplace (owner-only).
   */
  @UseGuards(JwtAuthGuard)
  @Post('publish')
  publish(@Body() dto: PublishMarketplaceItemDto, @Req() req: any) {
    return this.marketplaceService.publish(dto, req.user);
  }

  /**
   * Alias: POST /marketplace
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: PublishMarketplaceItemDto, @Req() req: any) {
    return this.marketplaceService.publish(dto, req.user);
  }

  /**
   * Authenticated: Install a published marketplace item into the user's personal repository.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/install')
  install(@Param('id') id: string, @Req() req: any) {
    return this.marketplaceService.installItem(id, req.user);
  }

  /**
   * Authenticated: Uninstall a marketplace item from the user's personal repository.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id/install')
  uninstall(@Param('id') id: string, @Req() req: any) {
    return this.marketplaceService.uninstallItem(id, req.user);
  }

  /**
   * Authenticated: Submit an update/change request to the original owner.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/request-update')
  requestUpdate(
    @Param('id') id: string,
    @Body() body: { title?: string; message?: string; agentName?: string },
    @Req() req: any,
  ) {
    return this.marketplaceService.createUpdateRequest(id, body, req.user);
  }

  /**
   * Public: View single marketplace item by ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.marketplaceService.findOne(id);
  }

  /**
   * Authenticated: Remove or unpublish an item (owner-only).
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.marketplaceService.remove(id, req.user);
  }
}
