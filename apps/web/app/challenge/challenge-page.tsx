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
  solved: boolean;
};

export default async function ChallengePage({ number }: { number: string }) {
  const parsed = Number(number);
  if (!/^\d{1,3}$/.test(number) || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return <main><p className="eyebrow">TREAT OR CODE · CHALLENGE</p><h1>Challenge not found</h1><p>Check the number on your paper slip and try again.</p><Link href="/">Back to the board</Link></main>;
  }
  let response: Response;
  try {
    response = await fetch(`${process.env.API_URL ?? 'http://localhost:3001'}/challenges/${parsed}`, { cache: 'no-store' });
  } catch {
    return <main><p className="eyebrow">TREAT OR CODE · CHALLENGE</p><h1>Challenge unavailable</h1><p>The challenge service is unavailable. Please try again.</p><Link href="/">Back to the board</Link></main>;
  }
  if (response.status === 404) return <main><p className="eyebrow">TREAT OR CODE · CHALLENGE {parsed}</p><h1>Challenge not found</h1><p>This number is not active. Check your paper slip.</p><Link href="/">Back to the board</Link></main>;
  if (!response.ok) return <main><p className="eyebrow">TREAT OR CODE · CHALLENGE</p><h1>Challenge unavailable</h1><p>The challenge service is unavailable. Please try again.</p><Link href="/">Back to the board</Link></main>;
  const challenge: Challenge = await response.json();

  return <main className="challenge-page">
    <p className="eyebrow">TREAT OR CODE · CHALLENGE {challenge.printed_number}</p>
    <h1>{challenge.title}</h1>
    <p className="difficulty">{challenge.difficulty}</p>
    <p className="description">{challenge.description}</p>
    {challenge.solved ? <section className="solved-message" role="status"><h2>Already solved</h2><p>This challenge has already been solved, so it is closed for everyone.</p></section> : <>
      {challenge.examples?.length > 0 && <section className="examples"><h2>Examples</h2>{challenge.examples.map((example, index) => <div key={index}>
        <p>Input</p><pre>{example.input ?? ''}</pre><p>Output</p><pre>{example.output ?? ''}</pre>
      </div>)}</section>}
      <Editor number={parsed} pythonVersion={challenge.python_version} starterCode={challenge.starter_code} examples={challenge.examples ?? []} />
    </>}
    <Link href="/">Back to the board</Link>
  </main>;
}
