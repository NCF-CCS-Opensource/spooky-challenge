import 'reflect-metadata';
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

@Injectable()
class HealthService {
  private readonly db = new Pool({ connectionString: process.env.DATABASE_URL });

  async ready() {
    await this.db.query('SELECT 1');
    return { status: 'ok' };
  }
}

@Controller('health')
class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get() check() { return this.health.ready(); }
}

@Module({ controllers: [HealthController], providers: [HealthService] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}

void bootstrap();
