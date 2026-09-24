import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { UserDto } from '@petjada/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { AuthGuard, type AuthUser } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { clearRefreshCookie } from '../common/refresh-cookie';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './users.dto';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.me(user.id);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto): Promise<UserDto> {
    return this.users.updateProfile(user.id, body);
  }

  /** Esborra el compte i totes les seves dades (RGPD). */
  @Delete('me')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    await this.users.deleteAccount(user.id);
    clearRefreshCookie(res, this.config);
    res.status(204).end();
  }
}
