import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * BigInt is not JSON-serialisable by default, and every monetary amount in this
 * system is a BigInt. Serialise as a string rather than a number: money must
 * never round-trip through a float on its way to a client.
 */
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // The API contract specifies 422 for validation failures (Blueprint §7.1).
      errorHttpStatusCode: 422,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? true,
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('DesignArc API')
      .setDescription(
        'Furniture manufacturing workflow platform. Stage lifecycle, post-inspection ' +
          'pricing, and payment records.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
    logger.log('OpenAPI docs available at /api/docs');
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`DesignArc API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
