// End-to-end tests against a running API + Piston + PostgreSQL stack (see docs/runbook.md).
// Disposable databases only: the tests seed fixture challenges and learning_interactions is append-only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import pg from 'pg';

const api = process.env.API_URL ?? 'http://localhost:3001';
const version = process.env.PISTON_PYTHON_VERSION ?? '3.12.0';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://treat_or_code:change-me@localhost:55432/treat_or_code' });
const DOUBLE = 'print(int(input()) * 2)';
const WRONG = 'print(0)';

const post = async (path, body) => {
  const response = await fetch(`${api}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const open = (n, user, visitId = randomUUID()) => post(`/challenges/${n}/open`, { visitId, learnerUsername: user }).then((r) => ({ ...r, visitId }));
const submit = (kind, n, visitId, user, code, stdin = '3\n') =>
  post(`/challenges/${n}/${kind}`, { visitId, learnerUsername: user, language: 'python', version, code, stdin });
const events = async (visitId) =>
  (await db.query('SELECT event_type FROM learning_interactions WHERE visit_id = $1 ORDER BY id', [visitId])).rows.map((r) => r.event_type);

before(async () => {
  await db.query(`INSERT INTO challenges (printed_number, title, description, difficulty, assessed_skill_id, starter_code)
    SELECT n, 'e2e ' || n, 'fixture', 'easy', 'variables', '' FROM generate_series(1, 100) n ON CONFLICT DO NOTHING`);
  await db.query(`UPDATE challenges SET hidden_tests = '[{"stdin":"2\\n","expected_output":"4\\n"},{"stdin":"21\\n","expected_output":"42\\n"}]'
    WHERE printed_number >= 90`);
});
after(() => db.end());

test('health check reports ready', async () => {
  assert.deepEqual(await (await fetch(`${api}/health`)).json(), { status: 'ok' });
});

test('every challenge 1-100 resolves; out-of-range and missing ones are 404', async () => {
  for (let n = 1; n <= 100; n++) assert.equal((await fetch(`${api}/challenges/${n}`)).status, 200, `challenge ${n}`);
  for (const n of [0, 101, -1]) assert.equal((await fetch(`${api}/challenges/${n}`)).status, 404, `challenge ${n}`);
  await db.query('DELETE FROM challenges WHERE printed_number = 89 AND NOT EXISTS (SELECT 1 FROM learning_interactions WHERE challenge_id = 89)');
  assert.equal((await fetch(`${api}/challenges/89`)).status, 404);
  assert.equal((await open(89, 'nobody')).status, 404);
});

test('challenge payload never includes hidden tests or judge config', async () => {
  const text = await (await fetch(`${api}/challenges/90`)).text();
  assert.doesNotMatch(text, /hidden_tests|judge_config|expected_output/);
});

test('happy path: run vs check, retries, solve, then closed for everyone', async () => {
  const user = 'Happy Path';
  const { status, visitId } = await open(91, user);
  assert.equal(status, 201);

  const run = await submit('run', 91, visitId, user, DOUBLE);
  assert.equal(run.body.output.trim(), '6');
  assert.equal(run.body.passed, undefined, 'Run Code must not judge');
  assert.deepEqual(await events(visitId), ['challenge_opened', 'code_run']);

  for (let i = 0; i < 3; i++) {
    const wrong = await submit('check', 91, visitId, user, WRONG);
    assert.deepEqual(Object.keys(wrong.body).sort(), ['passed', 'status', 'total']);
    assert.equal(wrong.body.status, 'wrong_answer');
    assert.doesNotMatch(JSON.stringify(wrong.body), /42/, 'hidden expected output must not leak');
  }
  const solved = await submit('check', 91, visitId, user, DOUBLE);
  assert.deepEqual(solved.body, { status: 'accepted', passed: 2, total: 2 });
  assert.deepEqual((await events(visitId)).slice(-2), ['submission_result', 'challenge_solved']);

  assert.equal((await submit('check', 91, visitId, user, DOUBLE)).status, 400, 'no submission after solve');
  assert.equal((await submit('run', 91, visitId, user, DOUBLE)).status, 400, 'no run after solve');
  assert.equal((await open(91, 'someone else')).status, 400, 'solved challenge cannot be reopened');
  assert.equal((await fetch(`${api}/challenges/91`).then((r) => r.json())).solved, true);
});

test('usernames differing in case or Unicode form link to one learner', async () => {
  const visits = [];
  for (const name of ['Amélie', 'AMÉLIE ', 'amélie']) visits.push((await open(92, name)).visitId);
  const { rows } = await db.query('SELECT DISTINCT learner_username FROM learning_interactions WHERE visit_id = ANY($1)', [visits]);
  assert.equal(rows.length, 1);
  assert.equal((await open(92, 'bad\u0000name')).status, 400);
});

test('give up: End challenge is idempotent, blocks submissions, and the challenge reopens as a new visit', async () => {
  const user = 'quitter';
  const { visitId } = await open(93, user);
  const ends = await Promise.all([1, 2].map(() => post('/challenges/93/end', { visitId, learnerUsername: user })));
  assert.deepEqual(ends.map((r) => r.status), [201, 201]);
  assert.equal((await events(visitId)).filter((e) => e === 'gave_up').length, 1, 'double-clicked End logs once');
  assert.equal((await submit('check', 93, visitId, user, DOUBLE)).status, 400, 'no submission after End challenge');

  const again = await open(93, user);
  assert.equal(again.status, 201);
  assert.notEqual(again.visitId, visitId);
});

test('refresh resumes the active visit; a non-opened visit cannot submit', async () => {
  const user = 'refresher';
  const { visitId } = await open(94, user);
  assert.equal((await submit('run', 94, visitId, user, DOUBLE)).status, 201); // same visitId after "refresh"
  assert.equal((await submit('run', 94, randomUUID(), user, DOUBLE)).status, 400);
  assert.equal((await submit('run', 94, visitId, 'impostor', DOUBLE)).status, 400);
});

test('double-clicked Check Solution logs exactly one solve', async () => {
  const user = 'double clicker';
  const { visitId } = await open(95, user);
  await Promise.all([1, 2].map(() => submit('check', 95, visitId, user, DOUBLE)));
  const log = await events(visitId);
  assert.equal(log.filter((e) => e === 'challenge_solved').length, 1);
  assert.equal(log.filter((e) => e === 'submission_result').length, 1, 'second click is rejected, not judged');
});

test('interaction log is append-only', async () => {
  await assert.rejects(db.query('UPDATE learning_interactions SET learner_username = $1', ['x']), /append-only/);
  await assert.rejects(db.query('DELETE FROM learning_interactions'), /append-only/);
});

test('export links learners across visits without raw usernames or source code', async () => {
  const user = 'Pseudonym Zed';
  const first = await open(96, user);
  await submit('check', 96, first.visitId, user, WRONG);
  await post('/challenges/96/end', { visitId: first.visitId, learnerUsername: user });
  const second = await open(96, ' pseudonym zed');
  await submit('check', 96, second.visitId, user, DOUBLE);

  const dir = mkdtempSync(join(tmpdir(), 'e2e-export-'));
  const { rows } = await db.query('SELECT row_to_json(i) AS r FROM learning_interactions i ORDER BY id');
  writeFileSync(join(dir, 'interactions.jsonl'), rows.map((x) => JSON.stringify(x.r)).join('\n') + '\n');
  const script = new URL('../scripts/export_bkt.py', import.meta.url).pathname;
  const run = spawnSync('python3', ['-I', script, 'interactions.jsonl', '--out', 'export'], {
    cwd: dir, env: { ...process.env, EXPORT_HMAC_KEY: 'e2e-secret-key-0123456789' }, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);

  const read = (name) => readFileSync(join(dir, 'export', name), 'utf8');
  for (const name of ['bkt_rows.csv', 'visit_outcomes.csv', 'manifest.json', 'report.md']) {
    assert.doesNotMatch(read(name), /pseudonym|zed|print\(/i, `${name} leaks a username or source code`);
  }
  const mine = read('visit_outcomes.csv').split('\n').filter((l) => l.includes(first.visitId) || l.includes(second.visitId));
  assert.equal(mine.length, 2);
  assert.equal(new Set(mine.map((l) => l.split(',')[0])).size, 1, 'same learner_id across both visits');
});
