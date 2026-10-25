import ChallengePage from './challenge-page';
import { redirect } from 'next/navigation';

export default async function LegacyChallengePage({ searchParams }: { searchParams: Promise<{ number?: string }> }) {
  const { number = '' } = await searchParams;
  if (number) redirect(`/challenge/${encodeURIComponent(number)}`);
  return <ChallengePage number="" />;
}
