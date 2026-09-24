import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AppendTrackResponse, FinishRouteResponse, PendingObjectsResponse } from '@petjada/shared';
import { AuthGuard, type AuthUser } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { UserRoutesService } from './user-routes.service';
import { AppendTrackDto } from './user-routes.dto';

@Controller('user-routes')
@UseGuards(AuthGuard)
export class UserRoutesController {
  constructor(private readonly userRoutes: UserRoutesService) {}

  /** Ruta en curs. Respon 204 sense cos si no n'hi ha cap. */
  @Get('active')
  async active(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    const active = await this.userRoutes.active(user.id);
    if (!active) {
      res.status(204).end();
      return;
    }
    res.json(active);
  }

  @Put(':id/track')
  appendTrack(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AppendTrackDto,
  ): Promise<AppendTrackResponse> {
    return this.userRoutes.appendTrack(user.id, id, body.points);
  }

  @Get(':id/objects')
  pendingObjects(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<PendingObjectsResponse> {
    return this.userRoutes.pendingObjects(user.id, id);
  }

  /**
   * Tanca la ruta. Si la cobertura no arriba al mínim configurat, la ruta
   * s'abandona (la fila desapareix) i `completed` és `false`; les captures
   * fetes es conserven.
   */
  @Post(':id/finish')
  @HttpCode(200)
  finish(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<FinishRouteResponse> {
    return this.userRoutes.finish(user.id, id);
  }
}
