import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { DirectionsProvider, DirectionsService } from './directions.service';

@Module({
  controllers: [RoutesController],
  providers: [RoutesService, { provide: DirectionsProvider, useClass: DirectionsService }],
  exports: [RoutesService],
})
export class RoutesModule {}
