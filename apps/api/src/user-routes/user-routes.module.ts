import { Module } from '@nestjs/common';
import { RoutesModule } from '../routes/routes.module';
import { UserRoutesController } from './user-routes.controller';
import { UserRoutesService } from './user-routes.service';

@Module({
  imports: [RoutesModule],
  controllers: [UserRoutesController],
  providers: [UserRoutesService],
})
export class UserRoutesModule {}
