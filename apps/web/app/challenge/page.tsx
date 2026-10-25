import Link from 'next/link';
import { notFound } from 'next/navigation';
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
};

export default async function ChallengePage({ searchParams }: { searchParams: Promise<{ number?: string }> }) {
  const { number } = await searchParams;
  const parsed = Number(number);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) notFound();
  let response: Response;
  try {
    response = await fetch(`${process.env.API_URL ?? 'http://localhost:3001'}/challenges/${parsed}`, { cache: 'no-store' });
  } catch {
    return <main><p className="eyebrow">TREAT OR CODE · CHALLENGE</p><h1>Challenge unavailable</h1><p>The challenge service is unavailable. Please try again.</p><Link href="/">Back to the board</Link></main>;
  }
  if (response.status === 404) notFound();
  if (!response.ok) return <main><p className="eyebrow">TREAT OR CODE · CHALLENGE</p><h1>Challenge unavailable</h1><p>The challenge service is unavailable. Please try again.</p><Link href="/">Back to the board</Link></main>;
  const challenge: Challenge = await response.json();

  return <main className="challenge-page">
    <p className="eyebrow">TREAT OR CODE · CHALLENGE {challenge.printed_number}</p>
    <h1>{challenge.title}</h1>
    <p className="difficulty">{challenge.difficulty}</p>
    <p className="description">{challenge.description}</p>
    {challenge.examples?.length > 0 && <section className="examples"><h2>Examples</h2>{challenge.examples.map((example, index) => <div key={index}>
      <p>Input</p><pre>{example.input ?? ''}</pre><p>Output</p><pre>{example.output ?? ''}</pre>
    </div>)}</section>}
    <Editor number={parsed} pythonVersion={challenge.python_version} starterCode={challenge.starter_code} examples={challenge.examples ?? []} />
    <Link href="/">Back to the board</Link>
  </main>;
}
