import 'reflect-metadata';
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
const maxJudgeMs = 20_000;
const minRunMs = 100;
const maxRunMs = 3000;
const defaultRunMs = 2000;
const maxJudgeCases = 100;
const maxChallenge = 100;
type ExecutionResult = { version: string; durationMs: number; exitStatus: number | null; output: string; error: string | null };

@Injectable()
class Database {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
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
    return this.withLocks([`visit:${visitId}`, `challenge:${printedNumber}`], async (client) => {
      const challenge = await client.query('SELECT 1 FROM challenges WHERE printed_number = $1', [printedNumber]);
      if (!challenge.rowCount) throw new NotFoundException('Challenge not found');
      await this.assertUnsolved(client, printedNumber);
      const elsewhere = await client.query(
        'SELECT 1 FROM learning_interactions WHERE visit_id = $1 AND challenge_id <> $2 LIMIT 1', [visitId, printedNumber],
      );
      if (elsewhere.rowCount) throw new BadRequestException('This visit belongs to a different challenge');
      await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'challenge_opened', null);
      return { visitId, learnerUsername };
    });
  }

  async endVisit(printedNumber: number, body: unknown) {
    const { visitId, learnerUsername } = this.visitRequest(body);
    return this.withLocks([`visit:${visitId}`], async (client) => {
      const ended = await client.query(
        "SELECT 1 FROM learning_interactions WHERE visit_id = $1 AND challenge_id = $2 AND learner_username = $3 AND event_type IN ('gave_up', 'challenge_solved') LIMIT 1",
        [visitId, printedNumber, learnerUsername],
      );
      if (ended.rowCount) return { ended: true };
      await this.assertActiveVisit(client, printedNumber, visitId, learnerUsername);
      await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'gave_up', null);
      return { ended: true };
    });
  }

  async revealHint(printedNumber: number, body: unknown) {
    const { visitId, learnerUsername } = this.visitRequest(body);
    const hintIndex = (body as Record<string, unknown>).hintIndex;
    return this.withLocks([`visit:${visitId}`, `challenge:${printedNumber}`], async (client) => {
      const challenge = await client.query('SELECT jsonb_array_length(hints) AS hints FROM challenges WHERE printed_number = $1', [printedNumber]);
      if (!challenge.rowCount) throw new NotFoundException('Challenge not found');
      if (!Number.isInteger(hintIndex) || (hintIndex as number) < 0 || (hintIndex as number) >= challenge.rows[0].hints) {
        throw new BadRequestException('Unknown hint');
      }
      await this.assertPlayable(client, printedNumber, visitId, learnerUsername);
      // Revealing the same hint again is not a new event: the partial unique index makes it a no-op.
      await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'hint_revealed', null, { metadata: { hint_index: hintIndex }, onConflictDoNothing: true });
      return { revealed: hintIndex };
    });
  }

  async execute(printedNumber: number, body: unknown, judged: boolean) {
    const { visitId, learnerUsername, code, stdin } = this.executeRequest(body);
    const locks = [`visit:${visitId}`, `challenge:${printedNumber}`];

    // Hold the DB client and advisory locks only for checks and writes, never across Piston calls.
    const challenge = await this.withLocks(locks, async (client) => {
      const found = await client.query(
        'SELECT hidden_tests, judge_config FROM challenges WHERE printed_number = $1', [printedNumber],
      );
      if (!found.rowCount) throw new NotFoundException('Challenge not found');
      await this.assertPlayable(client, printedNumber, visitId, learnerUsername);
      return found.rows[0];
    });

    const started = Date.now();
    const cases: Array<{ stdin: string; expected: string }> = judged
      ? (challenge.hidden_tests ?? []).map((test: { stdin?: string; output?: string; expected_output?: string }) => ({
          stdin: test.stdin ?? '', expected: test.expected_output ?? test.output ?? '',
        }))
      : [{ stdin, expected: '' }];
    if (judged && cases.length === 0) throw new BadRequestException('This challenge has no judge tests configured');
    if (cases.length > maxJudgeCases || cases.some((test) => Buffer.byteLength(test.stdin, 'utf8') > maxInputBytes || Buffer.byteLength(test.expected, 'utf8') > maxOutputBytes)) {
      throw new BadRequestException('Challenge judge data exceeds execution limits');
    }
    const limit = Math.min(maxRunMs, Math.max(minRunMs, Number(challenge.judge_config?.time_limit_ms) || defaultRunMs));
    const results: ExecutionResult[] = [];
    for (const test of cases) {
      const remaining = maxJudgeMs - (Date.now() - started);
      const result = remaining < minRunMs
        ? failure(Date.now(), 'time_limit_exceeded')
        : await this.run(code, test.stdin, Math.min(limit, remaining)); // NOSONAR: tests must run sequentially and stop at the first runner error
      results.push(result);
      if (result.error) break;
    }
    const failedRun = results.find((result) => result.error);
    const passed = failedRun ? 0 : cases.filter((test, index) => normalize(results[index].output) === normalize(test.expected)).length;
    const category = failedRun?.error ?? (passed === cases.length ? 'accepted' : 'wrong_answer');
    const elapsedMs = Date.now() - started;

    return this.withLocks(locks, async (client) => {
      await this.assertPlayable(client, printedNumber, visitId, learnerUsername);
      if (!judged) {
        const result = results[0];
        await this.record(client, printedNumber, result);
        await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'code_run', null);
        return { ...result, output: result.output.slice(0, maxOutputBytes) };
      }
      if (failedRun?.error === 'runner_unavailable') {
        // Infrastructure failure is not a learner attempt: keep it out of the event log, record it as execution metadata only.
        await this.record(client, printedNumber, failedRun);
        return { status: 'error', error: 'runner_unavailable' };
      }
      const attempts = await client.query(
        "SELECT count(*) FROM learning_interactions WHERE visit_id = $1 AND event_type = 'submission_result'", [visitId],
      );
      const durationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
      await this.record(client, printedNumber, { version: pythonVersion, durationMs, exitStatus: failedRun ? failedRun.exitStatus : 0, error: category });
      await this.recordInteraction(client, printedNumber, visitId, learnerUsername, 'submission_result', passed === cases.length && !failedRun, {
        metadata: { attempt_order: Number(attempts.rows[0].count) + 1, elapsed_ms: elapsedMs, failed_test_count: failedRun ? 1 : cases.length - passed, error_category: category }, eventVersion: 2,
      });
      if (failedRun) return { status: 'error', error: category };
      if (passed === cases.length) {
        const solve = await client.query(
          `INSERT INTO learning_interactions
           (visit_id, learner_username, challenge_id, event_type, content_version, language,
            assessed_skill_id, difficulty, is_correct)
           SELECT $2, $3, printed_number, 'challenge_solved', content_version, 'python', assessed_skill_id, difficulty, true
           FROM challenges WHERE printed_number = $1
           ON CONFLICT DO NOTHING`,
          [printedNumber, visitId, learnerUsername],
        );
        if (!solve.rowCount) throw new BadRequestException('This challenge has already been solved');
      }
      return { status: category, passed, total: cases.length };
    });
  }

  private async assertPlayable(client: PoolClient, number: number, visitId: string, username: string) {
    await this.assertUnsolved(client, number);
    await this.assertActiveVisit(client, number, visitId, username);
  }

  private async assertUnsolved(client: PoolClient, number: number) {
    const solved = await client.query(
      "SELECT 1 FROM learning_interactions WHERE challenge_id = $1 AND event_type = 'challenge_solved' LIMIT 1", [number],
    );
    if (solved.rowCount) throw new BadRequestException('This challenge has already been solved');
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

  private recordInteraction(client: PoolClient, number: number, visitId: string, username: string, event: 'challenge_opened' | 'code_run' | 'submission_result' | 'challenge_solved' | 'gave_up' | 'hint_revealed', correct: boolean | null, { metadata = {}, eventVersion = 1, onConflictDoNothing = false } = {}) {
    return client.query(
      `INSERT INTO learning_interactions
       (visit_id, learner_username, challenge_id, event_type, content_version, language,
        assessed_skill_id, difficulty, is_correct, metadata, event_version)
       SELECT $2, $3, printed_number, $4, content_version,
              CASE WHEN $4 IN ('challenge_opened', 'gave_up', 'hint_revealed') THEN NULL ELSE 'python' END,
              assessed_skill_id, difficulty, $5, $6::jsonb, $7
       FROM challenges WHERE printed_number = $1${onConflictDoNothing ? ' ON CONFLICT DO NOTHING' : ''}`,
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
      return failure(started, 'runner_unavailable');
    }
    if (!response.ok) return failure(started, 'runner_unavailable');
    const raw = await readBounded(response, maxRunnerResponseBytes);
    if (raw === null) return failure(started, 'output_limit_exceeded');
    let data: any;
    try { data = JSON.parse(raw); } catch {
      return failure(started, 'runner_unavailable');
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
    assertChallengeNumber(number);
    return this.challenges.findByNumber(number);
  }

  @Post(':number/open')
  open(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    assertChallengeNumber(number);
    return this.challenges.openVisit(number, body);
  }

  @Post(':number/end')
  end(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    assertChallengeNumber(number);
    return this.challenges.endVisit(number, body);
  }

  @Post(':number/hint')
  hint(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    assertChallengeNumber(number);
    return this.challenges.revealHint(number, body);
  }

  @Post(':number/run')
  run(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    assertChallengeNumber(number);
    return this.challenges.execute(number, body, false);
  }

  @Post(':number/check')
  check(@Param('number', ParseIntPipe) number: number, @Body() body: unknown) {
    assertChallengeNumber(number);
    return this.challenges.execute(number, body, true);
  }
}

@Module({ controllers: [HealthController, ChallengeController], providers: [Database, HealthService, ChallengeService] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '64kb' });
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
  return Buffer.concat(chunks).toString('utf8');
}

function assertChallengeNumber(number: number) {
  if (number < 1 || number > maxChallenge) throw new NotFoundException('Challenge not found');
}

function failure(started: number, error: string): ExecutionResult {
  return { version: pythonVersion, durationMs: Date.now() - started, exitStatus: null, output: '', error };
}

function normalize(value: string) { return value.replaceAll('\r\n', '\n').trimEnd(); }

void bootstrap();
