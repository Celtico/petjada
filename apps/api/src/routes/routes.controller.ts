import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { ActiveRouteResponse, PreviewRouteResponse, RouteDetailDto, RouteSummaryDto } from '@petjada/shared';
import { AuthGuard, type AuthUser } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RoutesService } from './routes.service';
import { CreateRouteDto, NearbyQueryDto, PreviewRouteDto } from './routes.dto';

@Controller('routes')
@UseGuards(AuthGuard)
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  /** Rutes pròpies i públiques properes al punt indicat, amb l'estat de l'usuari. */
  @Get()
  nearby(@CurrentUser() user: AuthUser, @Query() query: NearbyQueryDto): Promise<RouteSummaryDto[]> {
    return this.routes.nearby(user.id, query.lat, query.lon);
  }

  /** Previsualització (automàtica o manual) amb objectes proposats; no desa res. */
  @Post('preview')
  preview(@Body() body: PreviewRouteDto): Promise<PreviewRouteResponse> {
    return this.routes.preview(body);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateRouteDto): Promise<RouteDetailDto> {
    return this.routes.create(user.id, body);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RouteDetailDto> {
    return this.routes.detail(user.id, id, null);
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ActiveRouteResponse> {
    return this.routes.start(user.id, id);
  }
}
