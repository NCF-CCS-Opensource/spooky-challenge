import Link from 'next/link';
import Editor from './editor';

type Challenge = {
  printed_number: number;
  title: string;
  description: string;
  difficulty: string;
  starter_code: string;
  python_version: string;
  examples: Array<{ input?: string; output?: string }>;
  hints: string[];
  solved: boolean;
};

function Notice({ suffix = '', title, children }: Readonly<{ suffix?: string; title: string; children: string }>) {
  return <main className="notice-page" id="main-content"><Link className="brand" href="/">Treat or Code{suffix}</Link><h1>{title}</h1><p>{children}</p><Link href="/">Back to the board</Link></main>;
}

export default async function ChallengePage({ number }: Readonly<{ number: string }>) {
  const parsed = Number(number);
  if (!/^\d{1,3}$/.test(number) || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return <Notice title="Challenge not found">Check the number on your paper slip and try again.</Notice>;
  }
  let response: Response;
  try {
    response = await fetch(`${process.env.API_URL ?? 'http://localhost:3001'}/challenges/${parsed}`, { cache: 'no-store' });
  } catch {
    return <Notice title="Challenge unavailable">The challenge service is unavailable. Please try again.</Notice>;
  }
  if (response.status === 404) return <Notice suffix={` ${parsed}`} title="Challenge not found">This number is not active. Check your paper slip.</Notice>;
  if (!response.ok) return <Notice title="Challenge unavailable">The challenge service is unavailable. Please try again.</Notice>;
  const challenge: Challenge = await response.json();

  return <main className="challenge-page" id="main-content">
    <header className="workspace-header">
      <Link className="brand" href="/" aria-label="Treat or Code home"><span className="brand-mark" aria-hidden="true">{'{ }'}</span> Treat or Code</Link>
      <span className="workspace-location">Challenge <span className="challenge-number">{challenge.printed_number.toString().padStart(2, '0')}</span></span>
      <span className="workspace-caption">A little code. A little candy.</span>
    </header>
    <div className="workspace">
      <section className="problem-panel" aria-labelledby="problem-title">
        <div className="panel-heading"><span>Description</span><span className="panel-meta">No. {challenge.printed_number}</span></div>
        <div className="problem-content">
          <h1 id="problem-title">{challenge.title}</h1>
          <div className="problem-meta"><span className="difficulty">{challenge.difficulty}</span><span>Python {challenge.python_version}</span></div>
          <p className="description">{challenge.description}</p>
          {!challenge.solved && challenge.examples?.length > 0 && <section className="examples" aria-labelledby="examples-title">
            <h2 id="examples-title">Examples</h2>
            {challenge.examples.map((example, index) => <div className="example" key={`${example.input}|${example.output}`}>
              <h3>Example {index + 1}</h3>
              <dl><dt>Input</dt><dd><pre>{example.input ?? ''}</pre></dd><dt>Output</dt><dd><pre>{example.output ?? ''}</pre></dd></dl>
            </div>)}
          </section>}
        </div>
        <footer className="problem-footer">Read the problem. Try an idea. Make it work.</footer>
      </section>
      {challenge.solved ? <section className="closed-panel"><output className="solved-message"><h2>Already solved</h2><p>This challenge has already been solved, so it is closed for everyone.</p></output><Link href="/">Back to the board</Link></section> :
        <Editor number={parsed} pythonVersion={challenge.python_version} starterCode={challenge.starter_code} examples={challenge.examples ?? []} hints={challenge.hints ?? []} />}
    </div>
  </main>;
}
