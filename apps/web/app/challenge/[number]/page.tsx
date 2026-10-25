import ChallengePage from '../challenge-page';

export default async function NumberedChallengePage({ params }: Readonly<{ params: Promise<{ number: string }> }>) {
  const { number } = await params;
  return <ChallengePage number={number} />;
}
