import { Module } from '@nestjs/common';
import { ObjectsModule } from '../objects/objects.module';
import { CapturesController } from './captures.controller';
import { CapturesService } from './captures.service';

@Module({
  imports: [ObjectsModule],
  controllers: [CapturesController],
  providers: [CapturesService],
})
export class CapturesModule {}
