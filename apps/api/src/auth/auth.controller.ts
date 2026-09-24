import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { MagicLinkResponse } from '@petjada/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { AuthGuard, OptionalAuth, type AuthUser } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../common/refresh-cookie';
import { ApiError } from '../common/api-error';
import { AuthService, type Session } from './auth.service';
import { MagicLinkDto, VerifyCodeDto } from './auth.dto';

/**
 * Autenticació sense contrasenya. L'access token viatja al cos de la resposta;
 * el refresh token, en una cookie httpOnly amb path `/api/auth`.
 */
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private send(res: Response, session: Session, status = 200): void {
    setRefreshCookie(res, this.config, session.refreshToken);
    res.status(status).json(session.response);
  }

  /** Crea un convidat i n'emet la sessió. */
  @Post('guest')
  @RateLimit('light')
  async guest(@Res() res: Response): Promise<void> {
    this.send(res, await this.auth.guest(), 201);
  }

  /** Rota el refresh token de la cookie i emet un access token nou. */
  @Post('refresh')
  @RateLimit('light')
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      this.send(res, await this.auth.refresh(readRefreshCookie(req, this.config)));
    } catch (err) {
      clearRefreshCookie(res, this.config);
      throw err;
    }
  }

  @Post('logout')
  @RateLimit('light')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req, this.config));
    clearRefreshCookie(res, this.config);
    res.status(204).end();
  }

  /** Envia l'enllaç màgic i el codi. Amb Bearer de convidat, es fusionarà en verificar. */
  @Post('magic-link')
  @RateLimit('strict')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  @HttpCode(200)
  magicLink(@Body() body: MagicLinkDto, @CurrentUser() user: AuthUser | undefined): Promise<MagicLinkResponse> {
    return this.auth.requestMagicLink(body.email, user);
  }

  /**
   * Consumeix l'enllaç màgic (obert al navegador des del correu) i redirigeix a
   * la PWA amb la cookie de sessió posada: `${APP_URL}/#/auth/done`. En cas
   * d'error: `${APP_URL}/#/auth/error?code=<ApiErrorCode>`.
   */
  @Get('magic')
  @RateLimit('strict')
  async magic(@Query('token') token: string | undefined, @Res() res: Response): Promise<void> {
    const base = this.config.appUrl.replace(/\/$/, '');
    if (!token) {
      res.redirect(302, `${base}/#/auth/error?code=INVALID_CODE`);
      return;
    }
    try {
      const session = await this.auth.consumeMagicLink(token);
      setRefreshCookie(res, this.config, session.refreshToken);
      res.redirect(302, `${base}/#/auth/done`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'INTERNAL';
      res.redirect(302, `${base}/#/auth/error?code=${code}`);
    }
  }

  /** Verifica el codi de 6 xifres. Amb Bearer de convidat, fusiona el progrés. */
  @Post('verify-code')
  @RateLimit('strict')
  @UseGuards(AuthGuard)
  @OptionalAuth()
  async verifyCode(
    @Body() body: VerifyCodeDto,
    @CurrentUser() user: AuthUser | undefined,
    @Res() res: Response,
  ): Promise<void> {
    this.send(res, await this.auth.verifyCode(body.email, body.code, user));
  }
}
