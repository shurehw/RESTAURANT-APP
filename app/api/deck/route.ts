import { NextRequest, NextResponse } from 'next/server';

const DECK_PASSWORD = process.env.DECK_PASSWORD || 'kevaos2026';

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password !== DECK_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = Buffer.from(`deck:${Date.now()}`).toString('base64');
  const response = NextResponse.json({ ok: true });
  response.cookies.set('deck_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 4,
    path: '/',
  });
  return response;
}
