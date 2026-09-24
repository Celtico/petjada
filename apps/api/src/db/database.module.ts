import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { getConfig, APP_CONFIG } from '../config';
import { DatabaseService } from './database.service';
import { PG_POOL } from './tokens';

export { PG_POOL };

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => getConfig() },
    {
      provide: PG_POOL,
      useFactory: () => new Pool({ connectionString: getConfig().databaseUrl, max: 10 }),
    },
    DatabaseService,
  ],
  exports: [APP_CONFIG, PG_POOL, DatabaseService],
})
export class DatabaseModule {}
