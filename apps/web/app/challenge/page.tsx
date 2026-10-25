export default async function ChallengePage({ searchParams }: { searchParams: Promise<{ number?: string }> }) {
  const { number } = await searchParams;
  const parsed = Number(number);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100;

  return <main>
    <p className="eyebrow">TREAT OR CODE · CHALLENGE</p>
    <h1>{valid ? `Challenge ${parsed}` : 'Check your slip number'}</h1>
    <p>{valid ? 'Challenge content is being prepared.' : 'Enter a number from 1 to 100.'}</p>
    <a href="/">Back to the board</a>
  </main>;
}
