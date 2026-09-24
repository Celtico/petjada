import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AlbumResponse, CollectionDetailDto, CollectionSummaryDto } from '@petjada/shared';
import { AuthGuard, type AuthUser } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles, RolesGuard } from '../common/roles.guard';
import { NearbyQueryDto } from '../routes/routes.dto';
import { CollectionsService } from './collections.service';
import { AssignObjectsDto, UpsertCollectionDto } from './collections.dto';
import { OptionalNearbyQueryDto } from './album.dto';

@Controller('collections')
@UseGuards(AuthGuard, RolesGuard)
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  nearby(@CurrentUser() user: AuthUser, @Query() query: NearbyQueryDto): Promise<CollectionSummaryDto[]> {
    return this.collections.nearby(user.id, query.lat, query.lon);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<CollectionDetailDto> {
    return this.collections.detail(user.id, id);
  }

  @Post()
  @Roles('editor', 'admin')
  create(@CurrentUser() user: AuthUser, @Body() body: UpsertCollectionDto): Promise<CollectionDetailDto> {
    return this.collections.create(user, body);
  }

  @Patch(':id')
  @Roles('editor', 'admin')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpsertCollectionDto,
  ): Promise<CollectionDetailDto> {
    return this.collections.update(user, id, body);
  }

  @Delete(':id')
  @Roles('editor', 'admin')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.collections.remove(user, id);
  }

  @Put(':id/objects')
  @Roles('editor', 'admin')
  assignObjects(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignObjectsDto,
  ): Promise<CollectionDetailDto> {
    return this.collections.assignObjects(user, id, body.objectIds);
  }
}

@Controller('album')
@UseGuards(AuthGuard)
export class AlbumController {
  constructor(private readonly collections: CollectionsService) {}

  /** Les meves troballes i el progrés de col·leccions. `lat`/`lon` opcionals per incloure-hi les properes. */
  @Get()
  album(@CurrentUser() user: AuthUser, @Query() query: OptionalNearbyQueryDto): Promise<AlbumResponse> {
    return this.collections.album(user.id, query.lat ?? null, query.lon ?? null);
  }
}
