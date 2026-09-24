import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { UsersModule } from '../users/users.module';
import { RateLimitGuard } from '../common/rate-limit.guard';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, MailService, RateLimitGuard],
  exports: [AuthService],
})
export class AuthModule {}
