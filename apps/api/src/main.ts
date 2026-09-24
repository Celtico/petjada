import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { getConfig } from './config';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap(): Promise<void> {
  const config = getConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(config.port);
  const logger = new Logger('Petjada');
  logger.log(`API escoltant a http://localhost:${config.port}/api`);
  if (!config.mapboxToken) {
    logger.warn('MAPBOX_TOKEN no definit: la creació de rutes amb Directions fallarà.');
  }
  if (!config.smtpHost) {
    logger.warn('SMTP_HOST no definit: els enllaços i codis d’entrada sortiran per aquest log.');
  }
}

void bootstrap();
