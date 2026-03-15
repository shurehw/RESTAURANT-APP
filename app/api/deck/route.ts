import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

const DECK_PASSWORD = process.env.DECK_PASSWORD || 'kevaos2026';

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password !== DECK_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Set a session cookie so the GET endpoint can serve the deck
  const token = Buffer.from(`deck:${Date.now()}`).toString('base64');
  const response = NextResponse.json({ token });
  response.cookies.set('deck_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 4, // 4 hours
    path: '/',
  });
  return response;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('deck_token')?.value;
  if (!token) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const htmlPath = join(process.cwd(), 'lib', 'deck-content.html');
    const html = readFileSync(htmlPath, 'utf-8');
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new NextResponse('Deck not found', { status: 404 });
  }
}
