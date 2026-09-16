import {
  Controller, Post, Body, Get, UseGuards,
  Request, Response, UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto.email, dto.password, dto.role);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Response({ passthrough: true }) res: any) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const result = await this.authService.login(user);
    res.cookie(REFRESH_COOKIE, result.refresh_token, COOKIE_OPTS);

    return { access_token: result.access_token, user: result.user };
  }

  @Post('refresh')
  async refresh(@Request() req: any, @Response({ passthrough: true }) res: any) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) throw new UnauthorizedException('No refresh token cookie');

    // Decode without verifying to get userId, then verify the raw token against DB hash
    let userId: string;
    try {
      const decoded: any = JSON.parse(
        Buffer.from(rawToken.split('.')[1] ?? '', 'base64url').toString(),
      );
      userId = decoded?.sub;
    } catch {
      // rawToken is not a JWT — it's a random hex string, so we must scan by cookie
      // Instead, we embed userId in the cookie value as "userId:rawToken"
    }

    // Re-read: the cookie stores "userId:rawHex"
    const [uid, ...rest] = rawToken.split(':');
    const hex = rest.join(':');
    if (!uid || !hex) throw new UnauthorizedException('Malformed refresh token');

    const result = await this.authService.refreshAccessToken(uid, hex);
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req: any, @Response({ passthrough: true }) res: any) {
    await this.authService.logout(req.user.id);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return req.user;
  }
}
