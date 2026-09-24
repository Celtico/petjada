import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { CaptureResponse } from '@petjada/shared';
import { AuthGuard, type AuthUser } from '../common/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CapturesService } from './captures.service';
import { CaptureDto } from './captures.dto';

@Controller('captures')
@UseGuards(AuthGuard)
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Post()
  @HttpCode(201)
  capture(@CurrentUser() user: AuthUser, @Body() body: CaptureDto): Promise<CaptureResponse> {
    return this.captures.capture(user.id, body);
  }
}
