import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { PublishMarketplaceItemDto } from './dto/publish-marketplace-item.dto';
import { JwtService } from '@nestjs/jwt';

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
   * Public / Authenticated: Publish an agent or workflow to the marketplace.
   */
  @Post('publish')
  publish(@Body() dto: PublishMarketplaceItemDto, @Req() req: any) {
    const authUser = this.extractAuthUser(req);
    return this.marketplaceService.publish(dto, authUser);
  }

  /**
   * Alias: POST /marketplace
   */
  @Post()
  create(@Body() dto: PublishMarketplaceItemDto, @Req() req: any) {
    const authUser = this.extractAuthUser(req);
    return this.marketplaceService.publish(dto, authUser);
  }

  /**
   * Public: View single marketplace item by ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.marketplaceService.findOne(id);
  }

  /**
   * Remove or unpublish an item.
   */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.marketplaceService.remove(id);
  }
}
