import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ number: string; action: string }> }) {
  const { number, action } = await params;
  if (!/^\d{1,3}$/.test(number) || !['run', 'check', 'open', 'end'].includes(action)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  try {
    const response = await fetch(`${process.env.API_URL ?? 'http://localhost:3001'}/challenges/${number}/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: await request.text(), cache: 'no-store',
    });
    return new NextResponse(response.body, { status: response.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return NextResponse.json({ message: 'Challenge service unavailable' }, { status: 503 });
  }
}
