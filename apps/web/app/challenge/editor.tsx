'use client';

import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';

type Result = { output?: string; status?: string; error?: string; passed?: number; total?: number };

export default function Editor({ number, pythonVersion, starterCode, examples }: { number: number; pythonVersion: string; starterCode: string; examples: Array<{ input?: string }> }) {
  const [code, setCode] = useState(starterCode);
  const [stdin, setStdin] = useState(examples[0]?.input ?? '');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [learnerUsername, setLearnerUsername] = useState('');
  const [visitId, setVisitId] = useState('');

  useEffect(() => {
    const usernameKey = 'treat-or-code-learner';
    let username = localStorage.getItem(usernameKey);
    if (!username) {
      username = `learner-${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem(usernameKey, username);
    }
    const visitKey = `treat-or-code-visit-${number}`;
    let visit = sessionStorage.getItem(visitKey);
    if (!visit) {
      visit = crypto.randomUUID();
      sessionStorage.setItem(visitKey, visit);
    }
    setLearnerUsername(username);
    setVisitId(visit);
  }, [number]);

  async function submit(action: 'run' | 'check') {
    const pseudonym = learnerUsername.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(pseudonym)) {
      setResult({ error: 'Use a 3–32 character pseudonym with letters, numbers, hyphens, or underscores.' });
      return;
    }
    localStorage.setItem('treat-or-code-learner', pseudonym);
    setBusy(true); setResult(null);
    try {
      const response = await fetch(`/api/challenges/${number}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: 'python', version: pythonVersion, code, stdin, learnerUsername: pseudonym, visitId }),
      });
      const data = await response.json();
      setResult(response.ok ? data : { error: response.status === 503 ? 'runner_unavailable' : data.message ?? 'runner_unavailable' });
    } catch {
      setResult({ error: 'runner_unavailable' });
    } finally { setBusy(false); }
  }

  const errorText: Record<string, string> = {
    syntax_error: 'Syntax error: check your Python syntax and indentation.',
    runtime_error: 'Runtime error: your program stopped with an exception.',
    time_limit_exceeded: 'Time limit exceeded.',
    runner_unavailable: 'The code runner is unavailable. Try again shortly.',
    output_limit_exceeded: 'Output limit exceeded.',
    wrong_answer: 'Not quite. Review your code and try again.',
  };

  return <section className="workbench" aria-label="Python code editor">
    <div className="editor-heading"><strong>Your code</strong><span>Python {pythonVersion}</span></div>
    <CodeMirror value={code} height="340px" extensions={[python()]} onChange={setCode} aria-label="Python source code" />
    <label htmlFor="pseudonym">Your pseudonym</label>
    <input id="pseudonym" className="pseudonym" value={learnerUsername} onChange={(event) => setLearnerUsername(event.target.value)} maxLength={32} autoComplete="nickname" />
    <label htmlFor="stdin">Standard input</label>
    <textarea id="stdin" className="stdin" value={stdin} onChange={(event) => setStdin(event.target.value)} rows={3} maxLength={8000} />
    <div className="editor-actions">
      <button type="button" onClick={() => submit('run')} disabled={busy || !visitId}>{busy ? 'Running…' : 'Run Code'}</button>
      <button type="button" onClick={() => submit('check')} disabled={busy || !visitId}>Check Solution</button>
    </div>
    {result && <section className="result" aria-live="polite">
      <h2>{result.error ? (errorText[result.error] ?? result.error) : result.status === 'accepted' ? 'Solution accepted!' : result.status === 'wrong_answer' ? errorText.wrong_answer : 'Program output'}</h2>
      {result.status && ['accepted', 'wrong_answer'].includes(result.status) ? <p>{result.passed} of {result.total} tests passed.</p> : null}
      {result.output !== undefined && <pre>{result.output || '(no output)'}</pre>}
    </section>}
  </section>;
}
