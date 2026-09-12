import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Shift Scheduling API')
    .setDescription('Workforce management & shift scheduling backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  // Create Swagger / OpenAPI document
  const document = SwaggerModule.createDocument(app, config);

  // Swagger UI
  SwaggerModule.setup('api/docs', app, document);

  // Save OpenAPI specification to a JSON file
  writeFileSync(
    './openapi.json',
    JSON.stringify(document, null, 2),
    'utf-8',
  );

  // Also expose OpenAPI JSON through an API endpoint
  app
    .getHttpAdapter()
    .get('/api/openapi.json', (req, res) => {
      res.json(document);
    });

  const port = process.env.PORT || 3000;

  await app.listen(port);

  console.log(`Application running on: http://localhost:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api/docs`);
  console.log(
    `OpenAPI specification: http://localhost:${port}/api/openapi.json`,
  );
  console.log(`OpenAPI JSON saved to: ./openapi.json`);
}

bootstrap();

