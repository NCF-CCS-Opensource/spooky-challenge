'use client';

import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';

type Result = { output?: string; status?: string; error?: string; passed?: number; total?: number };
type Visit = { visitId: string; learnerUsername: string; number: number };
const visitKey = 'treat-or-code-active-visit';
const usernameKey = 'treat-or-code-learner';

function normalizeUsername(value: string) { return value.trim().normalize('NFKC').toLowerCase(); }
function validUsername(value: string) { return value.length >= 1 && value.length <= 40 && !/[\p{Cc}\p{Cf}]/u.test(value) && /^[\p{L}\p{N} _-]+$/u.test(value); }

export default function Editor({ number, pythonVersion, starterCode, examples }: { number: number; pythonVersion: string; starterCode: string; examples: Array<{ input?: string }> }) {
  const [code, setCode] = useState(starterCode);
  const [stdin, setStdin] = useState(examples[0]?.input ?? '');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [mode, setMode] = useState<'loading' | 'username' | 'conflict' | 'active' | 'ended'>('loading');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const active = localStorage.getItem(visitKey);
    const savedUsername = localStorage.getItem(usernameKey) ?? '';
    setUsername(savedUsername);
    if (!active) { setMode('username'); return; }
    try {
      const current: Visit = JSON.parse(active);
      if (!current.visitId || !current.learnerUsername || !Number.isInteger(current.number)) throw new Error();
      setVisit(current);
      setMode(current.number === number ? 'active' : 'conflict');
    } catch {
      localStorage.removeItem(visitKey);
      setMode('username');
    }
  }, [number]);

  async function startVisit() {
    const normalized = normalizeUsername(username);
    if (!validUsername(normalized)) { setError('Use 1–40 letters, numbers, spaces, hyphens, or underscores. Control characters are not allowed.'); return; }
    setBusy(true); setError('');
    const newVisit = { visitId: crypto.randomUUID(), learnerUsername: normalized, number };
    try {
      const response = await fetch(`/api/challenges/${number}/open`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitId: newVisit.visitId, learnerUsername: normalized }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? 'Could not open this challenge. Please try again.'); return; }
      localStorage.setItem(usernameKey, normalized);
      localStorage.setItem(visitKey, JSON.stringify(newVisit));
      setVisit(newVisit); setMode('active');
    } catch { setError('The challenge service is unavailable. Please try again.'); }
    finally { setBusy(false); }
  }

  async function endVisit(current: Visit | null) {
    if (!current) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/challenges/${current.number}/end`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitId: current.visitId, learnerUsername: current.learnerUsername }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? 'Could not end the visit. Please try again.'); return; }
      localStorage.removeItem(visitKey);
      setVisit(null);
      if (current.number === number) setMode('ended');
      else setMode('username');
    } catch { setError('The challenge service is unavailable. Please try again.'); }
    finally { setBusy(false); }
  }

  async function submit(action: 'run' | 'check') {
    if (!visit || mode !== 'active') return;
    setBusy(true); setResult(null); setError('');
    try {
      const response = await fetch(`/api/challenges/${number}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: 'python', version: pythonVersion, code, stdin, learnerUsername: visit.learnerUsername, visitId: visit.visitId }),
      });
      const data = await response.json();
      setResult(response.ok ? data : { error: response.status === 503 ? 'runner_unavailable' : data.message ?? 'runner_unavailable' });
      if (response.ok && data.status === 'accepted') {
        localStorage.removeItem(visitKey); setVisit(null); setMode('ended');
      }
    } catch { setResult({ error: 'runner_unavailable' }); }
    finally { setBusy(false); }
  }

  const errorText: Record<string, string> = {
    syntax_error: 'Syntax error: check your Python syntax and indentation.',
    runtime_error: 'Runtime error: your program stopped with an exception.',
    time_limit_exceeded: 'Time limit exceeded.',
    runner_unavailable: 'The code runner is unavailable. Try again shortly.',
    output_limit_exceeded: 'Output limit exceeded.',
    wrong_answer: 'Not quite. Review your code and try again.',
  };

  return <>
    <section className="workbench" aria-label="Python code editor" aria-busy={mode === 'loading' || busy}>
      <div className="editor-heading"><strong>Your code</strong><span>Python {pythonVersion}</span></div>
      <CodeMirror value={code} height="340px" extensions={[python()]} onChange={setCode} aria-label="Python source code" />
      <label htmlFor="stdin">Standard input</label>
      <textarea id="stdin" className="stdin" value={stdin} onChange={(event) => setStdin(event.target.value)} rows={3} maxLength={8000} />
      <div className="editor-actions">
        <button type="button" onClick={() => submit('run')} disabled={busy || mode !== 'active'}>{busy ? 'Running…' : 'Run Code'}</button>
        <button type="button" onClick={() => submit('check')} disabled={busy || mode !== 'active'}>Check Solution</button>
        {mode === 'active' && <button type="button" className="end-button" onClick={() => endVisit(visit)} disabled={busy}>End challenge</button>}
      </div>
      {mode === 'ended' && <p role="status">This visit has ended. Open the challenge again to start a new visit.</p>}
      {error && <p role="alert">{error}</p>}
      {result && <section className="result" aria-live="polite">
        <h2>{result.error ? (errorText[result.error] ?? result.error) : result.status === 'accepted' ? 'Solution accepted!' : result.status === 'wrong_answer' ? errorText.wrong_answer : 'Program output'}</h2>
        {result.status && ['accepted', 'wrong_answer'].includes(result.status) ? <p>{result.passed} of {result.total} tests passed.</p> : null}
        {result.output !== undefined && <pre>{result.output || '(no output)'}</pre>}
      </section>}
    </section>
    {mode === 'username' && <div className="modal-backdrop"><section className="visit-modal" role="dialog" aria-modal="true" aria-labelledby="username-title">
      <h2 id="username-title">Choose a pseudonym</h2>
      <p>Choose a unique pseudonym. Do not enter your real name or email.</p>
      <label htmlFor="pseudonym">Your pseudonym</label>
      <input id="pseudonym" className="pseudonym" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={80} autoComplete="off" autoFocus />
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={startVisit} disabled={busy}>{busy ? 'Opening…' : 'Start challenge'}</button>
    </section></div>}
    {mode === 'conflict' && <div className="modal-backdrop"><section className="visit-modal" role="dialog" aria-modal="true" aria-labelledby="active-title">
      <h2 id="active-title">A challenge visit is active</h2>
      <p>End challenge {visit?.number} before opening this challenge.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => endVisit(visit)} disabled={busy}>{busy ? 'Ending…' : 'End current visit and continue'}</button>
    </section></div>}
  </>;
}
