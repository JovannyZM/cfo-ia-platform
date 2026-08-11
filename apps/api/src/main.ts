import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { parseServerEnvironment } from '@cfo-ia/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const environment = parseServerEnvironment(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(environment.PORT, '0.0.0.0');
  Logger.log(
    JSON.stringify({
      event: 'application_started',
      environment: environment.NODE_ENV,
      port: environment.PORT,
      host: '0.0.0.0',
    }),
    'Bootstrap',
  );
}

void bootstrap().catch((error: unknown) => {
  Logger.error(
    JSON.stringify({
      event: 'application_start_failed',
      error: error instanceof Error ? error.message : 'Unknown startup error',
    }),
    undefined,
    'Bootstrap',
  );
  process.exitCode = 1;
});
