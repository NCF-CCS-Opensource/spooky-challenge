import 'reflect-metadata';
import { Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
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

@Injectable()
class ChallengeService {
  private readonly db = new Pool({ connectionString: process.env.DATABASE_URL });

  async findByNumber(printedNumber: number) {
    const result = await this.db.query(
      `SELECT printed_number, title, description, difficulty, assessed_skill_id,
              starter_code, examples, hints, content_version
       FROM challenges WHERE printed_number = $1`,
      [printedNumber],
    );
    if (!result.rowCount) throw new NotFoundException('Challenge not found');
    return result.rows[0];
  }
}

@Controller('health')
class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get() check() { return this.health.ready(); }
}

@Controller('challenges')
class ChallengeController {
  constructor(private readonly challenges: ChallengeService) {}

  @Get(':number')
  findByNumber(@Param('number', ParseIntPipe) number: number) {
    if (number < 1 || number > 100) throw new NotFoundException('Challenge not found');
    return this.challenges.findByNumber(number);
  }
}

@Module({ controllers: [HealthController, ChallengeController], providers: [HealthService, ChallengeService] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}

void bootstrap();
