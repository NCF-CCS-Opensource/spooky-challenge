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
  return <main><p className="eyebrow">TREAT OR CODE · CHALLENGE{suffix}</p><h1>{title}</h1><p>{children}</p><Link href="/">Back to the board</Link></main>;
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

  return <main className="challenge-page">
    <p className="eyebrow">TREAT OR CODE · CHALLENGE {challenge.printed_number}</p>
    <h1>{challenge.title}</h1>
    <p className="difficulty">{challenge.difficulty}</p>
    <p className="description">{challenge.description}</p>
    {challenge.solved ? <output className="solved-message"><h2>Already solved</h2><p>This challenge has already been solved, so it is closed for everyone.</p></output> : <>
      {challenge.examples?.length > 0 && <section className="examples"><h2>Examples</h2>{challenge.examples.map((example) => <div key={`${example.input}|${example.output}`}>
        <p>Input</p><pre>{example.input ?? ''}</pre><p>Output</p><pre>{example.output ?? ''}</pre>
      </div>)}</section>}
      <Editor number={parsed} pythonVersion={challenge.python_version} starterCode={challenge.starter_code} examples={challenge.examples ?? []} hints={challenge.hints ?? []} />
    </>}
    <Link href="/">Back to the board</Link>
  </main>;
}
