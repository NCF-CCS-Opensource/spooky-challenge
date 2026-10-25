import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException,
  Param, ParseIntPipe, Post,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool, type PoolClient } from 'pg';

const pythonVersion = process.env.PISTON_PYTHON_VERSION ?? '3.12.0';
const pistonUrl = process.env.PISTON_URL ?? 'http://localhost:2000';
const maxCodeBytes = 32_000;
const maxInputBytes = 8_000;
const maxOutputBytes = 16_000;
const maxRunnerResponseBytes = 64_000;
type ExecutionResult = { version: string; durationMs: number; exitStatus: number | null; output: string; error: string | null };

@Injectable()
class Database {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

@Injectable()
class HealthService {
  constructor(private readonly db: Database) {}
  async ready() {
    await this.db.pool.query('SELECT 1');
    return { status: 'ok' };
  }
}

@Injectable()
class ChallengeService {
  constructor(private readonly db: Database) {}

  async findByNumber(printedNumber: number) {
    const result = await this.db.pool.query(
      `SELECT printed_number, title, description, difficulty, assessed_skill_id,
              starter_code, examples, hints, content_version,
              EXISTS (SELECT 1 FROM learning_interactions i WHERE i.challenge_id = challenges.printed_number AND i.event_type = 'challenge_solved') AS solved
       FROM challenges WHERE printed_number = $1`,
      [printedNumber],
    );
    if (!result.rowCount) throw new NotFoundException('Challenge not found');
    return { ...result.rows[0], python_version: pythonVersion };
  }

  async openVisit(printedNumber: number, body: unknown) {
    const { visitId, learnerUsername } = this.visitRequest(body);
    return this.withLocks([`challenge:${printedNumber}`], async (client) => {
      const challenge = await client.query('SELECT 1 FROM challenges WHERE printed_number = $1', [printedNumber]);
      if (!challenge.rowCount) throw new NotFoundException('Challenge not found');
      const solved = await client.query(
        "SELECT 1 FROM learning_interactions WHERE challenge_id = $1 AND event_type = 'challenge_solved' LIMIT 1", [printedNumber],
      );
      if (solved.rowCount) throw new BadRequestException('This challenge has already been solved');
      await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'challenge_opened', null);
      return { visitId, learnerUsername };
    });
  }

  async endVisit(printedNumber: number, body: unknown) {
    const { visitId, learnerUsername } = this.visitRequest(body);
    return this.withLocks([`visit:${visitId}`], async (client) => {
      const ended = await client.query(
        "SELECT 1 FROM learning_interactions WHERE visit_id = $1 AND challenge_id = $2 AND learner_username = $3 AND event_type = 'gave_up' LIMIT 1",
        [visitId, printedNumber, learnerUsername],
      );
      if (ended.rowCount) return { ended: true };
      await this.assertActiveVisit(client, printedNumber, visitId, learnerUsername);
      await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'gave_up', null);
      return { ended: true };
    });
  }

  async execute(printedNumber: number, body: unknown, judged: boolean) {
    const { visitId, learnerUsername, code, stdin } = this.executeRequest(body);

    return this.withLocks([`visit:${visitId}`, `challenge:${printedNumber}`], async (client) => {
    const challenge = await client.query(
      'SELECT hidden_tests, judge_config FROM challenges WHERE printed_number = $1', [printedNumber],
    );
    if (!challenge.rowCount) throw new NotFoundException('Challenge not found');
    const solved = await client.query(
      "SELECT 1 FROM learning_interactions WHERE challenge_id = $1 AND event_type = 'challenge_solved' LIMIT 1",
      [printedNumber],
    );
    if (solved.rowCount) throw new BadRequestException('This challenge has already been solved');
    await this.assertActiveVisit(client, printedNumber, visitId, learnerUsername);

    const started = Date.now();
    const attempts = judged ? await client.query(
      "SELECT count(*) FROM learning_interactions WHERE visit_id = $1 AND event_type = 'submission_result'", [visitId],
    ) : null;
    const attemptOrder = attempts ? Number(attempts.rows[0].count) + 1 : null;

    const cases: Array<{ stdin: string; expected: string }> = judged
      ? (challenge.rows[0].hidden_tests ?? []).map((test: { stdin?: string; output?: string; expected_output?: string }) => ({
          stdin: test.stdin ?? '', expected: test.expected_output ?? test.output ?? '',
        }))
      : [{ stdin, expected: '' }];
    if (judged && cases.length === 0) throw new BadRequestException('This challenge has no judge tests configured');
    if (cases.length > 100 || cases.some((test) => Buffer.byteLength(test.stdin, 'utf8') > maxInputBytes || Buffer.byteLength(test.expected, 'utf8') > maxOutputBytes)) {
      throw new BadRequestException('Challenge judge data exceeds execution limits');
    }
    const limit = Math.min(3000, Math.max(100, Number(challenge.rows[0].judge_config?.time_limit_ms) || 2000));
    const results: ExecutionResult[] = [];
    for (const test of cases) {
      const result = await this.run(code, test.stdin, limit); // NOSONAR: tests must run sequentially and stop at the first runner error
      if (result.error) {
        await this.record(client, printedNumber, result);
        if (judged) await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'submission_result', false, {
          metadata: { attempt_order: attemptOrder, elapsed_ms: Date.now() - started, failed_test_count: 1, error_category: result.error }, eventVersion: 2,
        });
        else await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'code_run', null);
        return judged
          ? { status: 'error', error: result.error }
          : { ...result, output: result.output.slice(0, maxOutputBytes) };
      }
      results.push(result);
    }
    if (!judged) {
      const result = results[0];
      await this.record(client, printedNumber, result);
      await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'code_run', null);
      return { ...result, output: result.output.slice(0, maxOutputBytes) };
    }

    const passed = cases.filter((test, index) => normalize(results[index].output) === normalize(test.expected)).length;
    const category = passed === cases.length ? 'accepted' : 'wrong_answer';
    const elapsedMs = Date.now() - started;
    await this.record(client, printedNumber, { version: pythonVersion, durationMs: results.reduce((sum, r) => sum + r.durationMs, 0), exitStatus: 0, error: category });
    await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'submission_result', passed === cases.length, {
      metadata: { attempt_order: attemptOrder, elapsed_ms: elapsedMs, failed_test_count: cases.length - passed, error_category: category }, eventVersion: 2,
    });
    if (passed === cases.length) {
      await client.query(
        `INSERT INTO learning_interactions
         (visit_id, learner_username, challenge_id, event_type, content_version, language,
          assessed_skill_id, difficulty, is_correct)
         SELECT $2, $3, printed_number, 'challenge_solved', content_version, 'python', assessed_skill_id, difficulty, true
         FROM challenges WHERE printed_number = $1
         ON CONFLICT DO NOTHING`,
        [printedNumber, visitId, learnerUsername],
      );
    }
    return { status: category, passed, total: cases.length };
    });
  }

  private executeRequest(body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid request');
    const request = body as Record<string, unknown>;
    if (request.language !== 'python' || request.version !== pythonVersion) {
      throw new BadRequestException('Only the configured Python runtime is supported');
    }
    const { visitId, learnerUsername } = this.visitRequest(request);
    if (typeof request.code !== 'string' || Buffer.byteLength(request.code, 'utf8') > maxCodeBytes) {
      throw new BadRequestException('Code must be a string of at most 32000 bytes');
    }
    if (typeof request.stdin !== 'string' || Buffer.byteLength(request.stdin, 'utf8') > maxInputBytes) {
      throw new BadRequestException('Input must be a string of at most 8000 bytes');
    }
    return { visitId, learnerUsername, code: request.code, stdin: request.stdin };

  }

  private async withLocks<T>(keys: string[], action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.pool.connect();
    let transaction = false;
    try {
      await client.query('BEGIN');
      transaction = true;
      for (const key of keys) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
      const result = await action(client);
      await client.query('COMMIT');
      transaction = false;
      return result;
    } catch (error) {
      if (transaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private recordInteraction(client: PoolClient, number: number, visitId: string, username: string, event: 'challenge_opened' | 'code_run' | 'submission_result' | 'challenge_solved' | 'gave_up', correct: boolean | null, { metadata = {}, eventVersion = 1 } = {}) {
    return client.query(
      `INSERT INTO learning_interactions
       (visit_id, learner_username, challenge_id, event_type, content_version, language,
        assessed_skill_id, difficulty, is_correct, metadata, event_version)
       SELECT $2, $3, printed_number, $4, content_version,
              CASE WHEN $4 IN ('challenge_opened', 'gave_up') THEN NULL ELSE 'python' END,
              assessed_skill_id, difficulty, $5, $6::jsonb, $7
       FROM challenges WHERE printed_number = $1`,
      [number, visitId, username, event, correct, JSON.stringify(metadata), eventVersion],
    );
  }

  private visitRequest(body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid request');
    const request = body as Record<string, unknown>;
    if (typeof request.visitId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.visitId)
      || typeof request.learnerUsername !== 'string') throw new BadRequestException('A visit ID and learner pseudonym are required');
    const learnerUsername = request.learnerUsername.trim().normalize('NFKC').toLowerCase();
    if (/[\p{Cc}\p{Cf}]/u.test(learnerUsername) || !/^[\p{L}\p{N} _-]{1,40}$/u.test(learnerUsername)) {
      throw new BadRequestException('Use 1–40 letters, numbers, spaces, hyphens, or underscores; control characters are not allowed');
    }
    return { visitId: request.visitId, learnerUsername };
  }

  private async assertActiveVisit(client: PoolClient, number: number, visitId: string, username: string) {
    const result = await client.query(
      `SELECT 1 FROM learning_interactions opened
       WHERE opened.visit_id = $1 AND opened.challenge_id = $2 AND opened.learner_username = $3
         AND opened.event_type = 'challenge_opened'
         AND NOT EXISTS (SELECT 1 FROM learning_interactions ended WHERE ended.visit_id = $1 AND ended.event_type IN ('challenge_solved', 'gave_up'))
       LIMIT 1`, [visitId, number, username],
    );
    if (!result.rowCount) throw new BadRequestException('This challenge visit is not active');
  }

  private async run(code: string, stdin: string, timeout: number) {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${pistonUrl}/api/v2/execute`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          language: 'python', version: pythonVersion, files: [{ name: 'main.py', content: code }], stdin,
          run_timeout: timeout, compile_timeout: timeout, run_memory_limit: 134_217_728,
        }),
        signal: AbortSignal.timeout(timeout + 5000),
      });
    } catch {
      return { version: pythonVersion, durationMs: Date.now() - started, exitStatus: null, output: '', error: 'runner_unavailable' };
    }
    if (!response.ok) return { version: pythonVersion, durationMs: Date.now() - started, exitStatus: null, output: '', error: 'runner_unavailable' };
    const raw = await readBounded(response, maxRunnerResponseBytes);
    if (raw === null) return { version: pythonVersion, durationMs: Date.now() - started, exitStatus: null, output: '', error: 'output_limit_exceeded' };
    let data: any;
    try { data = JSON.parse(raw); } catch {
      return { version: pythonVersion, durationMs: Date.now() - started, exitStatus: null, output: '', error: 'runner_unavailable' };
    }
    const stdout = String(data.run?.stdout ?? '');
    const stderr = String(data.run?.stderr ?? '');
    const combinedOutput = String(data.run?.output ?? stdout + stderr);
    const output = Buffer.from(combinedOutput, 'utf8').subarray(0, maxOutputBytes).toString('utf8');
    let error: string | null = null;
    if (Buffer.byteLength(combinedOutput, 'utf8') > maxOutputBytes) error = 'output_limit_exceeded';
    else if (data.run?.signal === 'SIGKILL' || /time(?:d)? out|timeout/i.test(stderr)) error = 'time_limit_exceeded';
    else if (data.run?.code !== 0) error = stdout.length === 0 && /SyntaxError|IndentationError/.test(stderr) ? 'syntax_error' : 'runtime_error';
    return { version: String(data.version ?? pythonVersion), durationMs: Date.now() - started, exitStatus: data.run?.code ?? null, output, error };
  }

  private record(client: PoolClient, number: number, result: { version: string; durationMs: number; exitStatus: number | null; error: string | null }) {
    return client.query(
      `INSERT INTO code_executions (challenge_id, language, runtime_version, duration_ms, exit_status, error_category)
       VALUES ($1, 'python', $2, $3, $4, $5)`,
      [number, result.version, result.durationMs, result.exitStatus, result.error],
    );
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

  @Post(':number/open')
  open(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    if (number < 1 || number > 100) throw new NotFoundException('Challenge not found');
    return this.challenges.openVisit(number, body);
  }

  @Post(':number/end')
  end(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    if (number < 1 || number > 100) throw new NotFoundException('Challenge not found');
    return this.challenges.endVisit(number, body);
  }

  @Post(':number/run')
  run(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    if (number < 1 || number > 100) throw new NotFoundException('Challenge not found');
    return this.challenges.execute(number, body, false);
  }

  @Post(':number/check')
  check(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    if (number < 1 || number > 100) throw new NotFoundException('Challenge not found');
    return this.challenges.execute(number, body, true);
  }
}

@Module({ controllers: [HealthController, ChallengeController], providers: [Database, HealthService, ChallengeService] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '64kb' });
  await app.get(Database).pool.query(`CREATE TABLE IF NOT EXISTS code_executions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    challenge_id integer NOT NULL REFERENCES challenges(printed_number),
    language text NOT NULL CHECK (language = 'python'),
    runtime_version text NOT NULL,
    duration_ms integer NOT NULL CHECK (duration_ms >= 0),
    exit_status integer,
    error_category text CHECK (error_category IN (
      'syntax_error', 'runtime_error', 'time_limit_exceeded', 'runner_unavailable',
      'output_limit_exceeded', 'accepted', 'wrong_answer'
    )),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  )`);
  await app.get(Database).pool.query(readFileSync(join(__dirname, '../db/002-submission-result-v2.sql'), 'utf8'));
  await ensurePythonRuntime();
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}

async function ensurePythonRuntime() {
  const runtimes = await fetch(`${pistonUrl}/api/v2/runtimes`, { signal: AbortSignal.timeout(5000) });
  if (!runtimes.ok) throw new Error('Piston runtime list unavailable');
  const installed = await runtimes.json() as Array<{ language: string; version: string }>;
  if (installed.some((runtime) => runtime.language === 'python' && runtime.version === pythonVersion)) return;
  const response = await fetch(`${pistonUrl}/api/v2/packages`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ language: 'python', version: pythonVersion }), signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Unable to install pinned Python ${pythonVersion} runtime`);
}

async function readBounded(response: Response, maxBytes: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function normalize(value: string) { return value.replaceAll('\r\n', '\n').trimEnd(); }

void bootstrap();
