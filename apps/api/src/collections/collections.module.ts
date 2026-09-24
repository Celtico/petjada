import { Module } from '@nestjs/common';
import { AlbumController, CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';

@Module({
  controllers: [CollectionsController, AlbumController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
