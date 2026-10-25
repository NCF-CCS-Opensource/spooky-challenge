import ChallengePage from '../challenge-page';

export default async function NumberedChallengePage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return <ChallengePage number={number} />;
}
