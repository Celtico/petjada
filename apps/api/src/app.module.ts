import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RoutesModule } from './routes/routes.module';
import { ObjectsModule } from './objects/objects.module';
import { UserRoutesModule } from './user-routes/user-routes.module';
import { CapturesModule } from './captures/captures.module';
import { CollectionsModule } from './collections/collections.module';
import { getConfig } from './config';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      global: true,
      secret: getConfig().jwtSecret,
      signOptions: { expiresIn: getConfig().accessTtlS },
    }),
    AuthModule,
    UsersModule,
    RoutesModule,
    ObjectsModule,
    UserRoutesModule,
    CapturesModule,
    CollectionsModule,
  ],
})
export class AppModule {}
