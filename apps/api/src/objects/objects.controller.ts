import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import type { RouteObjectContentDto } from '@petjada/shared';
import { AuthGuard, type AuthUser } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ObjectsService } from './objects.service';
import { ObjectContentDto } from '../routes/content.dto';

/** Contingut de les fitxes: només per al creador de la ruta, editors i admins. */
@Controller()
@UseGuards(AuthGuard)
export class ObjectsController {
  constructor(private readonly objects: ObjectsService) {}

  @Get('routes/:id/objects/content')
  routeContent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) routeId: string): Promise<RouteObjectContentDto[]> {
    return this.objects.routeContent(user, routeId);
  }

  @Patch('objects/:id/content')
  updateContent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) objectId: string,
    @Body() body: ObjectContentDto,
  ): Promise<RouteObjectContentDto> {
    return this.objects.updateContent(user, objectId, body);
  }
}
