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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  /**
   * Public (optionally enriched for logged-in user):
   * Lists all published agents (`isPublished: true`) and workflows across all users.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.marketplaceService.findAll({ type, category, search }, req.user?.id);
  }

  /**
   * Authenticated: List all agents installed by the current user (`installedBy`).
   */
  @UseGuards(JwtAuthGuard)
  @Get('installed')
  getInstalled(@Req() req: any) {
    return this.marketplaceService.getInstalledItems(req.user);
  }

  /**
   * Authenticated: List update requests relevant to the current user.
   */
  @UseGuards(JwtAuthGuard)
  @Get('update-requests')
  listUpdateRequests(@Req() req: any, @Query('itemId') itemId?: string) {
    return this.marketplaceService.listUpdateRequests(req.user, itemId);
  }

  /**
   * Authenticated: Owner updates request status (`pending` | `reviewed` | `resolved`).
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
   * Authenticated (Owner-only): Publish or re-publish an agent/workflow to Marketplace.
   */
  @UseGuards(JwtAuthGuard)
  @Post('publish')
  publish(@Body() dto: PublishMarketplaceItemDto, @Req() req: any) {
    return this.marketplaceService.publish(dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: PublishMarketplaceItemDto, @Req() req: any) {
    return this.marketplaceService.publish(dto, req.user);
  }

  /**
   * Authenticated: Install a published agent into the user's Agent Repository (`installedBy`).
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/install')
  install(@Param('id') id: string, @Req() req: any) {
    return this.marketplaceService.installItem(id, req.user);
  }

  /**
   * Authenticated: Uninstall a Marketplace agent from the user's Agent Repository.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id/install')
  uninstall(@Param('id') id: string, @Req() req: any) {
    return this.marketplaceService.uninstallItem(id, req.user);
  }

  /**
   * Authenticated: Submit an update/change request directly to the original owner.
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
   * Public: View single published marketplace item.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.marketplaceService.findOne(id, req.user?.id);
  }

  /**
   * Authenticated (Owner-only): Unpublish / remove an item from the marketplace.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.marketplaceService.remove(id, req.user);
  }
}
